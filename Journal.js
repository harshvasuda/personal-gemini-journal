import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import axios from 'axios';

const Journal = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);

    const sendMessage = async () => {
        if (!input) return;
        setLoading(true);
        const idToken = await auth.currentUser.getIdToken();
        
        try {
            const res = await axios.post('/api/chat', {
                message: input,
                history: messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
                sessionId: "default-session"
            }, {
                headers: { Authorization: `Bearer ${idToken}` }
            });

            setMessages([...messages, { role: 'user', content: input }, { role: 'model', content: res.data.response }]);
            setInput('');
        } catch (err) {
            alert("Security/Network Error");
        }
        setLoading(false);
    };

    return (
        <div className="journal-container">
            <div className="chat-window">
                {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.role}`}>
                        {m.content}
                    </div>
                ))}
            </div>
            <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)}
                placeholder="How was your day?"
            />
            <button onClick={sendMessage} disabled={loading}>Send</button>
        </div>
    );
};

export default Journal;