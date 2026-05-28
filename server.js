require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not defined in .env");
    process.exit(1);
}

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://axis-alex.github.io/dj-mini-app/';
const bot = new Telegraf(BOT_TOKEN);

// --- Helpers ---

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus', '.wma'];
const AUDIO_MIMES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-m4a'];

function isAudioFile(fileName, mimeType) {
    if (mimeType && AUDIO_MIMES.some(m => mimeType.startsWith(m.split('/')[0]) && mimeType.includes('audio'))) return true;
    if (fileName) {
        const ext = path.extname(fileName).toLowerCase();
        return AUDIO_EXTENSIONS.includes(ext);
    }
    return false;
}

function getTrackCount(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM tracks WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
        });
    });
}

function saveTrack(userId, fileId, fileName, title, performer, duration, mimeType) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO tracks (user_id, file_id, file_name, title, performer, duration, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, fileId, fileName, title, performer, duration, mimeType],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function getUserTracks(userId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM tracks WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function deleteTrack(trackId, userId) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM tracks WHERE id = ? AND user_id = ?', [trackId, userId], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function fmtDuration(sec) {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return ` (${m}:${s < 10 ? '0' : ''}${s})`;
}

// --- Telegram Bot Logic ---

bot.start((ctx) => {
    ctx.reply(
        '🎧 *Katz Studio Pro*\n\n' +
        'Отправьте мне аудиофайлы (MP3, WAV, FLAC и др.), и я добавлю их в вашу библиотеку.\n\n' +
        '📋 *Команды:*\n' +
        '/list — показать библиотеку треков\n' +
        '/delete — удалить трек\n' +
        '/help — помощь',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎧 Открыть Mixer', web_app: { url: WEBAPP_URL } }]
                ]
            }
        }
    );
});

bot.help((ctx) => {
    ctx.reply(
        '🎧 *Katz Studio Pro — DJ Mixer*\n\n' +
        '📤 *Как добавить треки:*\n' +
        '• Отправьте аудиофайл (MP3, WAV, FLAC, M4A, OGG)\n' +
        '• Перешлите голосовое сообщение\n' +
        '• Прикрепите файл как документ\n\n' +
        '📋 *Команды:*\n' +
        '/list — показать библиотеку треков\n' +
        '/delete — удалить трек по номеру\n' +
        '/start — главное меню\n\n' +
        '🎛 *В миксере:*\n' +
        '• Нажмите «💬 Telegram» на деке, чтобы загрузить трек из библиотеки\n' +
        '• Pinch-to-zoom на графике для увеличения',
        { parse_mode: 'Markdown' }
    );
});

// --- /list command ---
bot.command('list', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const tracks = await getUserTracks(userId);
        if (tracks.length === 0) {
            return ctx.reply('📭 Библиотека пуста. Отправьте мне аудиофайлы!');
        }
        let msg = `📚 *Ваша библиотека* (${tracks.length} треков):\n\n`;
        tracks.forEach((t, i) => {
            const dur = fmtDuration(t.duration);
            msg += `${i + 1}. ${t.performer || '?'} — ${t.title || t.file_name}${dur}\n`;
        });
        msg += '\n_Для удаления: /delete <номер>_';
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка загрузки библиотеки.');
    }
});

// --- /delete command ---
bot.command('delete', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(/\s+/).slice(1);

    if (args.length === 0) {
        // Show list with delete hints
        const tracks = await getUserTracks(userId);
        if (tracks.length === 0) {
            return ctx.reply('📭 Библиотека пуста.');
        }
        let msg = '🗑 *Выберите трек для удаления:*\n\n';
        tracks.forEach((t, i) => {
            msg += `${i + 1}. ${t.performer || '?'} — ${t.title || t.file_name}\n`;
        });
        msg += '\n_Введите /delete <номер>, например: /delete 1_';
        return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    const index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) {
        return ctx.reply('❌ Укажите корректный номер трека. Пример: /delete 1');
    }

    try {
        const tracks = await getUserTracks(userId);
        if (index > tracks.length) {
            return ctx.reply(`❌ Нет трека с номером ${index}. Всего треков: ${tracks.length}`);
        }
        const track = tracks[index - 1];
        const deleted = await deleteTrack(track.id, userId);
        if (deleted > 0) {
            const remaining = await getTrackCount(userId);
            ctx.reply(`🗑 Удалён: "${track.title || track.file_name}"\n📚 Осталось треков: ${remaining}`);
        } else {
            ctx.reply('❌ Не удалось удалить трек.');
        }
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка при удалении.');
    }
});

// --- Audio message handler ---
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
        performer = ctx.from.first_name || 'You';
        duration = voice.duration || 0;
        mimeType = voice.mime_type;
    }

    try {
        await saveTrack(userId, fileId, fileName, title, performer, duration, mimeType);
        const count = await getTrackCount(userId);
        ctx.reply(
            `✅ *Трек сохранён!*\n🎵 ${performer} — ${title}\n📚 Всего в библиотеке: ${count}`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎧 Открыть Mixer', web_app: { url: WEBAPP_URL } }]
                    ]
                }
            }
        );
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка при сохранении трека.');
    }
});

// --- Document handler (MP3/WAV sent as files) ---
bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc) return;

    // Check if this document is an audio file
    if (!isAudioFile(doc.file_name, doc.mime_type)) {
        return ctx.reply('⚠️ Отправьте аудиофайл (MP3, WAV, FLAC, M4A, OGG и др.).');
    }

    const userId = ctx.from.id;
    const fileId = doc.file_id;
    const fileName = doc.file_name || 'Unknown Track';
    const title = path.parse(fileName).name; // filename without extension
    const performer = ctx.from.first_name || 'Unknown Artist';
    const mimeType = doc.mime_type || 'audio/mpeg';
    const duration = 0; // Documents don't have duration metadata

    try {
        await saveTrack(userId, fileId, fileName, title, performer, duration, mimeType);
        const count = await getTrackCount(userId);
        ctx.reply(
            `✅ *Файл сохранён!*\n🎵 ${title}\n📁 ${fileName}\n📚 Всего в библиотеке: ${count}`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎧 Открыть Mixer', web_app: { url: WEBAPP_URL } }]
                    ]
                }
            }
        );
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка при сохранении файла.');
    }
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
    
    db.get(`SELECT * FROM tracks WHERE file_id = ? AND user_id = ?`, [fileId, user.id], async (err, row) => {
        if (err || !row) {
            return res.status(404).send('Track not found or access denied');
        }

        try {
            // Get file link from Telegram
            const fileLink = await bot.telegram.getFileLink(fileId);
            
            // Proxy the file to avoid exposing bot token and avoid CORS issues
            const response = await fetch(fileLink.href);
            
            if (!response.ok) {
                return res.status(response.status).send('Failed to fetch from Telegram');
            }

            res.set('Content-Type', row.mime_type || 'audio/mpeg');
            response.body.pipe(res);
        } catch (error) {
            console.error('Error fetching file:', error);
            res.status(500).send('Error streaming track');
        }
    });
});

// --- Serve Static Files Safely ---
const fs = require('fs');

app.get('/', (req, res) => {
    // Inject API base URL into index.html so the frontend knows where the API is
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Inject a script tag before the first <script> to set window.__API_BASE
    const apiBaseScript = `<script>window.__API_BASE = '';</script>\n`;
    html = html.replace('<script src="https://telegram.org/js/telegram-web-app.js">', apiBaseScript + '<script src="https://telegram.org/js/telegram-web-app.js">');
    res.type('html').send(html);
});
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));

app.use(express.static(__dirname, {
    index: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.sqlite') || filePath.endsWith('.env') || filePath.endsWith('.js') || filePath.endsWith('.json') || filePath.endsWith('.md')) {
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
