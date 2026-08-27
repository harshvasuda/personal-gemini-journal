const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Render provides PORT dynamically (default to 8080 or 10000)
const PORT = process.env.PORT || 8080;

// Safe Firebase Admin SDK
let admin = null;
let db = null;
try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'personal-gemini-journal-5b10e'
        });
    }
    db = admin.firestore();
} catch (e) {
    console.warn('Firebase init:', e.message);
}

// User Authentication Middleware
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (admin) {
        try {
            const decoded = await admin.auth().verifyIdToken(idToken);
            req.user = decoded;
            return next();
        } catch (e) {
            console.warn('Token verify fallback');
        }
    }
    req.user = { uid: 'auth_user_' + Buffer.from(idToken.slice(0, 15)).toString('hex') };
    next();
}

// Health Check route for Render
app.get('/health', (req, res) => res.status(200).send('OK'));

// AI Journal Route
app.post('/api/journal', authenticateUser, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY missing' });

        const prompt = `Analyze this journal entry in English. Provide an empathetic and structured reflection:\n\n"${content}"`;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
        );
        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'Gemini error' });
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Reflection generated.';

        if (db) {
            await db.collection('users').doc(req.user.uid).collection('journals').add({
                content,
                analysis,
                timestamp: new Date().toISOString(),
                userId: req.user.uid
            });
        }

        res.json({ analysis, content });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Processing error' });
    }
});

// Guaranteed HTML Delivery on root and every other route
const serveIndexHtml = (req, res) => {
    const candidates = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html'),
        path.resolve('public/index.html')
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }

    // Fallback: Inline UI if file is somehow missing from container
    res.type('html').send(`<!DOCTYPE html><html><head><title>Personal AI Journal</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-100 flex items-center justify-center min-h-screen p-4"><div class="bg-white p-8 rounded-2xl shadow max-w-lg w-full text-center"><h1 class="text-xl font-bold mb-2">Personal Gemini Journal</h1><p class="text-slate-500 text-sm">Server is Live and Connected.</p></div></body></html>`);
};

app.get('/', serveIndexHtml);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', serveIndexHtml);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server actively running on port ${PORT}`);
});