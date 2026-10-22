import { apiUrl } from './api.js';
import { getAuth } from 'firebase/auth';

class SmartChatSession {
    constructor(options = {}) {
        this.userId = options.userId || null;
        this.chatId = options.chatId || null;
        this.history = [];
    }

    async getIdToken() {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return null;
        return await user.getIdToken(true);
    }

    async sendMessage(message, idToken) {
        const headers = { 'Content-Type': 'application/json' };
        if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
        }

        const body = {
            userId: this.userId,
            chatId: this.chatId,
            message,
            history: this.history,
        };

        const response = await fetch(apiUrl('/api/gemini/chat'), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Network error' }));
            throw new Error(error.error || `Request failed with status ${response.status}`);
        }

        const data = await response.json();

        // Accumulate history for multi-turn conversations
        this.history.push({ role: 'user', parts: [{ text: message }] });
        this.history.push({ role: 'model', parts: [{ text: data.text }] });

        // Wrap in the shape ChatArea.js expects: { response: { text() } }
        return {
            response: {
                text: () => data.text,
            },
        };
    }
}

export const GeminiService = {
    startChat: (options) => {
        return new SmartChatSession(options);
    },

    generateTitle: async (message, idToken = null) => {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (idToken) {
                headers['Authorization'] = `Bearer ${idToken}`;
            }

            const response = await fetch(apiUrl('/api/gemini/title'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                throw new Error(`Title generation failed with status ${response.status}`);
            }

            const data = await response.json();
            return data.text.trim();
        } catch (error) {
            console.warn('Title generation failed:', error);
            return message.substring(0, 20) + '...';
        }
    },
};