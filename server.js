require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not defined. Set it in Environment Variables.");
    process.exit(1);
}

// WEBAPP_URL — the public URL where this server is deployed
// On Render: https://your-service-name.onrender.com
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://axis-alex.github.io/dj-mini-app/';
const bot = new Telegraf(BOT_TOKEN);

// --- Helpers ---

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus', '.wma'];

function isAudioFile(fileName, mimeType) {
    if (mimeType && mimeType.startsWith('audio/')) return true;
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
            `INSERT OR IGNORE INTO tracks (user_id, file_id, file_name, title, performer, duration, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, fileId, fileName, title, performer, duration, mimeType],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, isNew: this.changes > 0 });
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

// --- Telegram Bot Commands ---

bot.start((ctx) => {
    ctx.reply(
        '🎧 *Katz Studio Pro*\n\n' +
        'Отправьте мне аудиофайлы (MP3, WAV, FLAC и др.), и я добавлю их в вашу библиотеку.\n\n' +
        '📋 *Команды:*\n' +
        '/list — показать библиотеку треков\n' +
        '/delete — удалить трек\n' +
        '/sync — восстановить библиотеку\n' +
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
        '/sync — восстановить библиотеку из чата\n' +
        '/start — главное меню\n\n' +
        '🔄 *Синхронизация:* Если библиотека пуста — нажмите «Синхронизировать» в миксере или используйте /sync',
        { parse_mode: 'Markdown' }
    );
});

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

bot.command('delete', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(/\s+/).slice(1);

    if (args.length === 0) {
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

// --- /sync command ---
bot.command('sync', async (ctx) => {
    const userId = ctx.from.id;
    const count = await getTrackCount(userId);
    ctx.reply(
        '🔄 *Синхронизация библиотеки*\n\n' +
        `Сейчас в базе: ${count} треков.\n\n` +
        'Чтобы восстановить библиотеку, просто *перешлите* мне ваши аудиофайлы из этого чата:\n\n' +
        '1. Прокрутите чат вверх\n' +
        '2. Нажмите на аудиофайл → *Переслать*\n' +
        '3. Выберите этого бота\n\n' +
        '💡 Можно выбрать несколько файлов сразу! Дубликаты будут пропущены автоматически.',
        { parse_mode: 'Markdown' }
    );
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
        const result = await saveTrack(userId, fileId, fileName, title, performer, duration, mimeType);
        const count = await getTrackCount(userId);
        if (result.isNew) {
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
        } else {
            ctx.reply(`⏩ Трек уже в библиотеке (${count} шт.)`);
        }
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка при сохранении трека.');
    }
});

// --- Document handler (MP3/WAV sent as files) ---
bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc) return;

    if (!isAudioFile(doc.file_name, doc.mime_type)) {
        return ctx.reply('⚠️ Отправьте аудиофайл (MP3, WAV, FLAC, M4A, OGG и др.).');
    }

    const userId = ctx.from.id;
    const fileId = doc.file_id;
    const fileName = doc.file_name || 'Unknown Track';
    const title = path.parse(fileName).name;
    const performer = ctx.from.first_name || 'Unknown Artist';
    const mimeType = doc.mime_type || 'audio/mpeg';
    const duration = 0;

    try {
        const result = await saveTrack(userId, fileId, fileName, title, performer, duration, mimeType);
        const count = await getTrackCount(userId);
        if (result.isNew) {
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
        } else {
            ctx.reply(`⏩ Файл уже в библиотеке (${count} шт.)`);
        }
    } catch (err) {
        console.error(err);
        ctx.reply('❌ Ошибка при сохранении файла.');
    }
});

// --- Start bot (polling mode) ---
bot.launch().then(() => {
    console.log('🤖 Telegram bot started');
}).catch(err => {
    console.error('Bot launch error:', err.message);
});

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

// Health check (useful for Render)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '4.1.0', uptime: process.uptime() });
});

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

// Sync: trigger bot to ask user to re-forward tracks
app.post('/api/sync', async (req, res) => {
    const initData = req.query.initData || req.body.initData;
    const user = validateInitData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const count = await getTrackCount(user.id);
        await bot.telegram.sendMessage(user.id,
            '🔄 *Синхронизация из миксера*\n\n' +
            `Сейчас в базе: ${count} треков.\n\n` +
            'Чтобы восстановить библиотеку — *перешлите* мне ваши аудиофайлы из истории чата.\n\n' +
            '💡 Выберите несколько файлов → Переслать → этот бот. Дубликаты пропускаются автоматически.',
            { parse_mode: 'Markdown' }
        );
        res.json({ status: 'ok', message: 'Sync message sent', currentTracks: count });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: 'Failed to send sync message' });
    }
});

// Proxy audio stream from Telegram
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
            const fileLink = await bot.telegram.getFileLink(fileId);
            const tgResponse = await fetch(fileLink.href);
            
            if (!tgResponse.ok) {
                return res.status(tgResponse.status).send('Failed to fetch from Telegram');
            }

            // Forward Content-Length from Telegram so client can show progress
            const contentLength = tgResponse.headers.get('content-length');
            const headers = {
                'Content-Type': row.mime_type || 'audio/mpeg',
                'Cache-Control': 'public, max-age=3600'
            };
            if (contentLength) headers['Content-Length'] = contentLength;
            res.set(headers);

            // Stream directly — no buffering on our server
            const { Readable } = require('stream');
            const nodeStream = Readable.fromWeb(tgResponse.body);
            nodeStream.pipe(res);
            nodeStream.on('error', (e) => {
                console.error('Stream pipe error:', e.message);
                if (!res.headersSent) res.status(500).send('Stream error');
            });
        } catch (error) {
            console.error('Stream error:', error.message);
            if (!res.headersSent) res.status(500).send('Error streaming track');
        }
    });
});

// --- Serve Frontend ---
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Inject API base (empty = same origin, which is correct on Render)
    const apiBaseScript = `<script>window.__API_BASE = '';</script>\n`;
    html = html.replace('<script src="https://telegram.org/js/telegram-web-app.js">', apiBaseScript + '<script src="https://telegram.org/js/telegram-web-app.js">');
    res.type('html').send(html);
});
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));

// Static assets (images etc.) but block sensitive files
app.use(express.static(__dirname, {
    index: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.sqlite') || filePath.endsWith('.env') || 
            filePath.endsWith('.json') || filePath.endsWith('.md') ||
            filePath.includes('node_modules') || filePath.includes('.git')) {
            res.status(403).end();
        }
    }
}));

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 WEBAPP_URL: ${WEBAPP_URL}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
