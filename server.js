require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // Dynamic import for node-fetch if needed, or we can use native fetch

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not defined in .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- Telegram Bot Logic ---
bot.start((ctx) => {
    ctx.reply('Привет! Отправь мне любой аудиофайл (MP3, WAV) или голосовое сообщение, и я добавлю его в твою библиотеку Katz Studio Pro.', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎧 Открыть Mixer', web_app: { url: process.env.WEBAPP_URL || 'https://axis-alex.github.io/dj-mini-app/' } }]
            ]
        }
    });
});

bot.on(['audio', 'voice'], async (ctx) => {
    const userId = ctx.from.id;
    let fileId, fileName, title, performer, duration, mimeType;

    if (ctx.message.audio) {
        const audio = ctx.message.audio;
        fileId = audio.file_id;
        fileName = audio.file_name || 'Unknown Track';
        title = audio.title || fileName;
        performer = audio.performer || 'Unknown Artist';
        duration = audio.duration || 0;
        mimeType = audio.mime_type;
    } else if (ctx.message.voice) {
        const voice = ctx.message.voice;
        fileId = voice.file_id;
        fileName = 'Voice Message';
        title = `Voice Message (${new Date().toLocaleString()})`;
        performer = 'You';
        duration = voice.duration || 0;
        mimeType = voice.mime_type;
    }

    // Save to DB
    db.run(
        `INSERT INTO tracks (user_id, file_id, file_name, title, performer, duration, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, fileId, fileName, title, performer, duration, mimeType],
        function (err) {
            if (err) {
                console.error(err);
                return ctx.reply('Произошла ошибка при сохранении трека.');
            }
            ctx.reply(`✅ Трек "${title}" сохранён! Откройте приложение, чтобы сыграть его.`);
        }
    );
});

// Start bot
bot.launch();

// --- Validation helper ---
function validateInitData(initData) {
    if (!initData) return null;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const keys = Array.from(urlParams.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${urlParams.get(key)}`).join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (calculatedHash !== hash) return null;
    
    const userStr = urlParams.get('user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        return null;
    }
}

// --- API Endpoints ---

// Get user's tracks
app.get('/api/tracks', (req, res) => {
    const initData = req.query.initData || req.headers['authorization'];
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    db.all(`SELECT * FROM tracks WHERE user_id = ? ORDER BY created_at DESC`, [user.id], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Proxy audio stream
app.get('/api/tracks/:fileId/stream', async (req, res) => {
    const initData = req.query.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).send('Unauthorized');
    }

    const fileId = req.params.fileId;
    
    // Optional: check if user owns this track
    db.get(`SELECT * FROM tracks WHERE file_id = ? AND user_id = ?`, [fileId, user.id], async (err, row) => {
        if (err || !row) {
            return res.status(404).send('Track not found or access denied');
        }

        try {
            // Get file link from Telegram
            const fileLink = await bot.telegram.getFileLink(fileId);
            
            // Proxy the file to avoid exposing bot token and avoid CORS issues
            // Use native fetch (Node 18+)
            const response = await fetch(fileLink.href);
            
            if (!response.ok) {
                return res.status(response.status).send('Failed to fetch from Telegram');
            }

            res.set('Content-Type', row.mime_type || 'audio/mpeg');
            // If the size is known, we could set Content-Length, but streaming works without it
            // Telegram supports Range requests, so piping directly usually works, 
            // but for seeking Tone.js might need to download the whole file anyway.
            
            response.body.pipe(res);
        } catch (error) {
            console.error('Error fetching file:', error);
            res.status(500).send('Error streaming track');
        }
    });
});

// --- Serve Static Files Safely ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
// Let them fetch any image or other asset if they add it later, but not dotfiles or .js/.sqlite
app.use(express.static(__dirname, {
    index: false,
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.sqlite') || path.endsWith('.env') || path.endsWith('.js') || path.endsWith('.json') || path.endsWith('.md')) {
            res.status(403).end();
        }
    }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
