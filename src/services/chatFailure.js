/**
 * Failed AI response persistence helpers.
 *
 * Pure-ish by design: persistence is exercised via an injected saveMessage
 * dependency so the failure path can be unit tested without DOM or Firebase.
 */

export const AI_FAILURE_MESSAGE = 'No se pudo generar la respuesta. Intentá de nuevo.';
export const AI_AUTH_FAILURE_MESSAGE = 'Tu sesión venció. Iniciá sesión de nuevo para seguir chateando.';
export const AI_RATE_LIMIT_MESSAGE = 'Demasiados mensajes en poco tiempo. Esperá un momento y volvé a intentar.';
export const AI_SERVER_FAILURE_MESSAGE = 'El servicio de IA no está disponible en este momento. Intentá de nuevo más tarde.';
export const AI_NETWORK_FAILURE_MESSAGE = 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
export const USER_SAVE_FAILURE_MESSAGE = 'No se pudo guardar el mensaje. Revisá tu conexión y volvé a intentar.';

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network error|fetch failed|cors|load failed/i;

/**
 * Map a proxy failure to copy that describes what actually happened.
 * A 403 here is a rejected dev origin (the browser usually surfaces it as a
 * fetch TypeError), so it belongs with connection failures, not auth.
 */
export function classifyAiFailure(error) {
    const status = error?.status ?? error?.response?.status ?? error?.statusCode;

    if (status === 401) {
        return AI_AUTH_FAILURE_MESSAGE;
    }
    if (status === 429) {
        return AI_RATE_LIMIT_MESSAGE;
    }
    if (status === 403) {
        return AI_NETWORK_FAILURE_MESSAGE;
    }
    if (typeof status === 'number' && status >= 500) {
        return AI_SERVER_FAILURE_MESSAGE;
    }

    if (error instanceof TypeError || NETWORK_ERROR_PATTERN.test(error?.message || '')) {
        return AI_NETWORK_FAILURE_MESSAGE;
    }

    return AI_FAILURE_MESSAGE;
}

/**
 * A failure bubble is only truthful when it was persisted and the send still
 * belongs to the chat currently on screen. A null chatId must never render an
 * error that claims to be part of the history.
 */
export function shouldRenderPersistedFailure({ isCurrentChat, messageId }) {
    return Boolean(isCurrentChat && messageId);
}

export async function persistFailedAiMessage({ userId, chatId, saveMessage, message = AI_FAILURE_MESSAGE }) {
    if (!userId || !chatId) {
        return null;
    }

    return saveMessage(userId, chatId, message, 'ai');
}
