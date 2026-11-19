/**
 * Failed AI response persistence helpers.
 *
 * Pure-ish by design: persistence is exercised via an injected saveMessage
 * dependency so the failure path can be unit tested without DOM or Firebase.
 */

export const AI_FAILURE_MESSAGE = 'Error de conexión o API Key inválida.';

export async function persistFailedAiMessage({ userId, chatId, saveMessage }) {
    if (!userId || !chatId) {
        return null;
    }

    return saveMessage(userId, chatId, AI_FAILURE_MESSAGE, 'ai');
}
