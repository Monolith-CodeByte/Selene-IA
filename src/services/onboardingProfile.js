/**
 * Onboarding profile payload policy — pure by design (no Firebase, no DOM).
 *
 * Builds the profile fields saved when onboarding completes. Optional fields
 * with no user choice are omitted (never invented as 'unknown', never null).
 */

export function buildOnboardingProfilePayload({ preferredName, discoverySource, usageIntent }) {
    const payload = {
        preferredName,
        onboardingComplete: true,
    };

    if (discoverySource) {
        payload.discoverySource = discoverySource;
    }

    if (usageIntent) {
        payload.usageIntent = usageIntent;
    }

    return payload;
}
