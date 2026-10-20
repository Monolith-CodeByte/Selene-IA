/**
 * Profile field policy — the single source of truth for what a user is allowed
 * to change on their own profile document.
 *
 * This module deliberately has no Firebase or Vite dependency so it can be unit
 * tested in plain Node (see tests/profile-fields.test.js).
 *
 * IMPORTANT: `ALLOWED_PROFILE_FIELDS` mirrors `userUpdateFields()` in
 * /firestore.rules. The rules are the real security boundary — this filter only
 * prevents accidental writes and turns a rejected field into an immediate,
 * local warning instead of a permission-denied round trip.
 *
 * PROTECTED (never add here): role, plan, permissions, email, createdAt, lastLogin.
 */

export const ALLOWED_PROFILE_FIELDS = [
    'preferredName',
    'discoverySource',
    'usageIntent',
    'onboardingComplete'
];

/**
 * Splits caller input into the fields that may be written and the ones dropped.
 *
 * @param {unknown} data Caller-supplied profile data.
 * @returns {{ safeData: Record<string, unknown>, rejected: string[] }}
 */
export function sanitizeProfileUpdate(data) {
    const safeData = {};
    const rejected = [];

    if (!data || typeof data !== 'object') {
        return { safeData, rejected };
    }

    for (const [key, value] of Object.entries(data)) {
        if (ALLOWED_PROFILE_FIELDS.includes(key)) {
            safeData[key] = value;
        } else {
            rejected.push(key);
        }
    }

    return { safeData, rejected };
}
