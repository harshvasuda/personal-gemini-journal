const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Firebase Admin (Using ADC - Application Default Credentials)
admin.initializeApp();
const db = admin.firestore();

/**
 * SECURE DIRECTIVE 1: Fetch API key from Environment Variables
 */
async function getGeminiApiKey() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in environment variables");
    }
    return apiKey;
}

/**
 * SECURE DIRECTIVE 2: Authentication Middleware
 */
const authenticate = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).send('Unauthorized');
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(401).send('Invalid Token');
    }
};

/**
 * JOURNAL ENTRY ENDPOINT (Connected with Frontend index.html)
 */
app.post('/api/journal', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: "Content is required" });
        }

        const apiKey = await getGeminiApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Analyze this journal entry in pure English. Provide a thoughtful, empathetic, well-structured reflection and actionable insights: "${content}"`;
        const result = await model.generateContent(prompt);
        const analysis = result.response.text();

        res.json({ analysis });
    } catch (error) {
        console.error("Journal Error:", error.message);
        res.status(500).json({ error: "Failed to process journal entry." });
    }
});

/**
 * MULTI-TURN CHAT & JOURNALING (Authenticated)
 */
app.post('/api/chat', authenticate, async (req, res) => {
    try {
        const { message, history, sessionId } = req.body;
        const apiKey = await getGeminiApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(message);
        const response = await result.response.text();

        const messageRef = db.collection('users').doc(req.user.uid)
            .collection('sessions').doc(sessionId)
            .collection('messages');

        await messageRef.add({
            role: 'user', 
            content: message, 
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        await messageRef.add({
            role: 'model', 
            content: response, 
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ response });
    } catch (error) {
        console.error("Internal Error:", error.message);
        res.status(500).json({ error: "Failed to process journal entry." });
    }
});

/**
 * AI Mood Summarization & Analytics (Authenticated)
 */
app.get('/api/analytics/mood-summary', authenticate, async (req, res) => {
    try {
        const apiKey = await getGeminiApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const snapshot = await db.collection('users').doc(req.user.uid)
            .collection('sessions').orderBy('timestamp', 'desc').limit(10).get();

        const logs = snapshot.docs.map(doc => doc.data().lastMessage).join(". ");

        const prompt = `Analyze the following journal entries in English and provide a JSON response with: 
        1. dominant_mood (string) 
        2. mood_score (1-10) 
        3. weekly_summary (brief paragraph). Entries: ${logs}`;

        const result = await model.generateContent(prompt);
        const analytics = JSON.parse(result.response.text());

        res.json(analytics);
    } catch (error) {
        console.error("Mood Analytics Error:", error.message);
        res.status(500).json({ error: "Mood analysis failed." });
    }
});

/**
 * Explicit Root and Fallback Routes
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));