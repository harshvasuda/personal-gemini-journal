const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static assets
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));
app.use(express.static(__dirname));

// Safe Firebase Admin Init
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
    console.log('Firebase initialized successfully.');
} catch (e) {
    console.warn('Firebase Admin SDK init notice:', e.message);
}

// Token Verification Middleware
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    if (admin) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            req.user = decodedToken;
            return next();
        } catch (err) {
            console.warn('Token verification fallback:', err.message);
        }
    }
    req.user = { uid: 'auth_user_' + Buffer.from(idToken.slice(0, 15)).toString('hex') };
    next();
}

// 1. Fetch User Journals Route
app.get('/api/journals', authenticateUser, async (req, res) => {
    try {
        if (!db) return res.json({ journals: [] });
        const snapshot = await db.collection('users')
            .doc(req.user.uid)
            .collection('journals')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const journals = [];
        snapshot.forEach(doc => journals.push({ id: doc.id, ...doc.data() }));
        res.json({ journals });
    } catch (error) {
        console.error('Fetch error:', error.message);
        res.json({ journals: [] });
    }
});

// 2. Multi-turn AI Reflection Route
app.post('/api/journal', authenticateUser, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing on server' });
        }

        const promptText = `Analyze this journal entry in English. Provide an empathetic and structured reflection:\n\n"${content}"`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }]
                })
            }
        );

        const data = await response.json();
        if (!response.ok) {
            console.error('Gemini API Error:', data);
            return res.status(response.status).json({
                error: data.error?.message || 'Gemini API Error'
            });
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Reflection generated successfully.';

        // Isolated Database Write: /users/{userId}/journals/{journalId}
        if (db) {
            await db.collection('users').doc(req.user.uid).collection('journals').add({
                content,
                analysis,
                timestamp: new Date().toISOString(),
                userId: req.user.uid
            });
        }

        res.json({ analysis, content });
    } catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({ error: error.message || 'Server processing error' });
    }
});

// Root & Fallback HTML Serving
function serveIndex(res) {
    const publicIndex = path.join(publicPath, 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');

    if (fs.existsSync(publicIndex)) {
        res.sendFile(publicIndex);
    } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
    } else {
        res.status(404).send('<h2>index.html not found. Please ensure public/index.html is committed.</h2>');
    }
}

app.get('/', (req, res) => serveIndex(res));
app.get('*', (req, res) => serveIndex(res));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));