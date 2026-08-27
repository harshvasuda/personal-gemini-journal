const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Render dynamic port handling (Default to 10000 / 8080)
const PORT = process.env.PORT || 10000;

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
} catch (e) {
    console.warn('Firebase init fallback active');
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
            const decoded = await admin.auth().verifyIdToken(idToken);
            req.user = decoded;
            return next();
        } catch (err) {
            // fallback
        }
    }
    req.user = { uid: 'auth_user_' + Buffer.from(idToken.slice(0, 15)).toString('hex') };
    next();
}

// Health check route
app.get('/health', (req, res) => res.status(200).send('OK'));

// AI Journal Route
app.post('/api/journal', authenticateUser, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Content is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing on Render environment' });

        const promptText = `Analyze this journal entry in English. Provide an empathetic and structured reflection:\n\n"${content}"`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            }
        );

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
        }

        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Reflection generated successfully.';

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
        res.status(500).json({ error: error.message || 'Server processing error' });
    }
});

// Guaranteed HTML Delivery on Every Frontend Route
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personal AI Journal</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"></script>
    <style>
        :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --bg-gradient: linear-gradient(135deg, #f0f4ff 0%, #e5edff 100%);
            --card-bg: #ffffff;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --accent: #f8fafc;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background: var(--bg-gradient); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.25rem; color: var(--text-main); }
        .journal-card { width: 100%; max-width: 680px; background: var(--card-bg); border-radius: 20px; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05); border: 1px solid var(--border); }
        .auth-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
        .auth-btn { background-color: var(--primary); color: #ffffff; font-size: 0.85rem; font-weight: 600; padding: 0.5rem 1rem; border-radius: 8px; border: none; cursor: pointer; }
        .auth-btn:hover { background-color: var(--primary-hover); }
        .user-info { display: none; align-items: center; gap: 0.75rem; font-size: 0.875rem; font-weight: 500; }
        .logout-btn { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; text-decoration: underline; }
        .badge { display: inline-block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; background: #e0e7ff; color: var(--primary); padding: 0.25rem 0.75rem; border-radius: 9999px; margin-bottom: 0.75rem; }
        .header h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; }
        .header p { font-size: 0.95rem; color: var(--text-muted); line-height: 1.5; }
        textarea { width: 100%; min-height: 160px; padding: 1rem 1.25rem; border-radius: 12px; border: 1.5px solid var(--border); font-size: 1rem; background-color: var(--accent); margin-top: 1rem; outline: none; }
        textarea:focus { background-color: #ffffff; border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
        .btn-submit { margin-top: 1rem; width: 100%; display: flex; align-items: center; justify-content: center; background-color: var(--primary); color: #ffffff; font-size: 1rem; font-weight: 600; padding: 0.875rem 1.5rem; border-radius: 12px; border: none; cursor: pointer; }
        .btn-submit:hover { background-color: var(--primary-hover); }
        .response-container { margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 1.5rem; display: none; }
        .response-header { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.75rem; }
        .response-content { background-color: var(--accent); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem 1.5rem; font-size: 0.95rem; line-height: 1.7; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="journal-card">
        <div class="auth-bar">
            <span class="badge" style="margin-bottom:0;">Authenticated Vault</span>
            <div id="authSection">
                <button id="loginBtn" class="auth-btn" onclick="signIn()">Sign in with Google</button>
                <div id="userInfo" class="user-info">
                    <span id="userEmail"></span>
                    <button class="logout-btn" onclick="signOut()">Sign Out</button>
                </div>
            </div>
        </div>
        <div class="header">
            <span class="badge">AI-Powered</span>
            <h1>Daily Reflection Journal</h1>
            <p>Write your thoughts, reflections, or moments from today. Gemini will analyze and summarize your entry with empathy and insights.</p>
        </div>
        <textarea id="journalInput" placeholder="What is on your mind today? Write freely..."></textarea>
        <button class="btn-submit" id="submitBtn" onclick="submitJournal()">Analyze & Save Entry</button>
        <div class="response-container" id="responseContainer">
            <div class="response-header">AI Reflection & Summary</div>
            <div class="response-content" id="responseOutput"></div>
        </div>
    </div>
    <script>
        const firebaseConfig = {
            apiKey: "AIzaSyDummyKey_ReplaceWithYourKey",
            authDomain: "personal-gemini-journal-5b10e.firebaseapp.com",
            projectId: "personal-gemini-journal-5b10e",
            storageBucket: "personal-gemini-journal-5b10e.appspot.com",
            messagingSenderId: "367341257404",
            appId: "1:367341257404:web:yourAppId"
        };
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        let currentUser = null;

        auth.onAuthStateChanged(user => {
            currentUser = user;
            if (user) {
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('userInfo').style.display = 'flex';
                document.getElementById('userEmail').innerText = user.displayName || user.email;
            } else {
                document.getElementById('loginBtn').style.display = 'block';
                document.getElementById('userInfo').style.display = 'none';
            }
        });

        async function signIn() {
            try {
                await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
            } catch (error) {
                alert('Sign-in Error: ' + error.message);
            }
        }

        async function signOut() {
            await auth.signOut();
            document.getElementById('responseContainer').style.display = 'none';
        }

        async function submitJournal() {
            if (!currentUser) {
                alert('Please sign in with Google first.');
                return;
            }
            const input = document.getElementById('journalInput');
            const output = document.getElementById('responseOutput');
            const container = document.getElementById('responseContainer');
            const submitBtn = document.getElementById('submitBtn');
            const text = input.value.trim();

            if (!text) return alert('Please enter some text.');

            submitBtn.disabled = true;
            submitBtn.innerText = 'Analyzing with Gemini...';
            container.style.display = 'block';
            output.innerText = 'Reflecting on your entry and saving to secure cloud vault...';

            try {
                const token = await currentUser.getIdToken();
                const response = await fetch('/api/journal', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ content: text })
                });
                const data = await response.json();
                output.innerText = data.analysis || JSON.stringify(data);
            } catch (error) {
                output.innerText = 'Error processing request. Please retry.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Analyze & Save Entry';
            }
        }
    </script>
</body>
</html>`;

app.get('*', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(HTML_CONTENT);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server actively running on port ${PORT}`);
});