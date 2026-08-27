const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Firebase Admin (Using ADC)
admin.initializeApp();
const db = admin.firestore();

/**
 * JOURNAL ENTRY ENDPOINT (Direct Google Gemini REST API)
 */
app.post('/api/journal', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: "Content is required" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured on server" });
        }

        const promptText = `Analyze this journal entry in pure English. Provide a thoughtful, empathetic, and structured reflection: "${content}"`;

        // Direct standard REST endpoint that supports this auth key format
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: promptText }]
                    }]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error Detail:", JSON.stringify(data));
            return res.status(response.status).json({ 
                error: data.error?.message || "Failed to generate response from Gemini." 
            });
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";
        res.json({ analysis });

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ error: error.message || "Failed to process journal entry." });
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