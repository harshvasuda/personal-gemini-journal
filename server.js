const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Path resolver for static files
const publicDir = path.resolve(__dirname, 'public');
app.use(express.static(publicDir));
app.use(express.static(path.resolve(__dirname)));

// Firebase Admin Init
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Middleware: Authenticate Firebase ID Token
async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (err) {
        console.error('Auth verification error:', err.message);
        return res.status(403).json({ error: 'Unauthorized: Invalid or expired token' });
    }
}

// 1. Fetch User-Isolated Journals
app.get('/api/journals', authenticateUser, async (req, res) => {
    try {
        const snapshot = await db.collection('users')
            .doc(req.user.uid)
            .collection('journals')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const journals = [];
        snapshot.forEach(doc => {
            journals.push({ id: doc.id, ...doc.data() });
        });
        res.json({ journals });
    } catch (error) {
        console.error('Fetch journals error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch journal entries.' });
    }
});

// 2. Multi-turn AI Reflection + Isolated Firestore Storage
app.post('/api/journal', authenticateUser, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
        }

        const promptText = `Analyze this journal entry in English. Provide an empathetic and structured reflection:\n\n"${content}"`;

        // Direct v1beta endpoint with gemini-3.6-flash
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: promptText }]
                    }]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API Error Detail:', JSON.stringify(data));
            return res.status(response.status).json({
                error: data.error?.message || 'Failed to generate response from Gemini.'
            });
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reflection generated.';

        // Isolated Database Write: /users/{userId}/journals/{journalId}
        const journalDoc = {
            content,
            analysis,
            timestamp: new Date().toISOString(),
            userId: req.user.uid
        };

        const docRef = await db.collection('users')
            .doc(req.user.uid)
            .collection('journals')
            .add(journalDoc);

        res.json({
            id: docRef.id,
            ...journalDoc
        });

    } catch (error) {
        console.error('Server Error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to process journal entry.' });
    }
});

// Robust HTML serving helper
function serveIndex(res) {
    const publicIndex = path.join(publicDir, 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');

    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    } else if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
    } else {
        return res.status(404).send('<h2>index.html file not found in public/ or root directory.</h2>');
    }
}

app.get('/', (req, res) => serveIndex(res));
app.get('*', (req, res) => serveIndex(res));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));