/**
 * Failed AI response persistence helpers.
 *
 * Pure-ish by design: persistence is exercised via an injected saveMessage
 * dependency so the failure path can be unit tested without DOM or Firebase.
 */

export const AI_FAILURE_MESSAGE = 'Error de conexión o API Key inválida.';
export const USER_SAVE_FAILURE_MESSAGE = 'No se pudo guardar el mensaje. Revisá tu conexión y volvé a intentar.';

/**
 * A failure bubble is only truthful when it was persisted and the send still
 * belongs to the chat currently on screen. A null chatId must never render an
 * error that claims to be part of the history.
 */
export function shouldRenderPersistedFailure({ isCurrentChat, messageId }) {
    return Boolean(isCurrentChat && messageId);
}

export async function persistFailedAiMessage({ userId, chatId, saveMessage }) {
    if (!userId || !chatId) {
        return null;
    }

    return saveMessage(userId, chatId, AI_FAILURE_MESSAGE, 'ai');
}
