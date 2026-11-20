/**
 * Pure decisions for the post-login flow.
 *
 * Kept free of DOM and Firebase imports so the create-vs-resume rule, the
 * bounded retry counter and the onboarding teardown can be unit-tested in
 * plain Node. main.js owns the transport (rendering, auth, Firestore writes).
 */

export const PROFILE_ACTION = Object.freeze({
    CREATE: 'create',
    ONBOARDING: 'onboarding',
    APP: 'app',
});

/**
 * Decide what to do once a profile snapshot is available.
 * A missing profile is created. An existing but incomplete profile resumes
 * onboarding WITHOUT any write: calling createUserProfile on an existing doc
 * uses setDoc(merge:true), which Firestore evaluates as an update and denies.
 */
export function resolveProfileAction(profile) {
    if (profile === null) return PROFILE_ACTION.CREATE;
    if (!profile.onboardingComplete) return PROFILE_ACTION.ONBOARDING;
    return PROFILE_ACTION.APP;
}

/**
 * Bounded failure counter for the login flow. reset() is called on sign-out so
 * a deterministic failure cannot become a permanent dead end across sessions.
 */
export function createAttemptCounter(maxAttempts = 3) {
    let attempts = 0;
    return {
        get value() {
            return attempts;
        },
        recordFailure() {
            attempts += 1;
            return attempts;
        },
        isExhausted() {
            return attempts >= maxAttempts;
        },
        reset() {
            attempts = 0;
        },
    };
}

/**
 * Holds the real onboarding node so sign-out can remove the node that was
 * actually created (`.onboarding-container`) instead of querying a phantom
 * `.onboarding-screen` selector that never matches the DOM.
 */
export function createOnboardingScreen() {
    let node = null;
    return {
        get current() {
            return node;
        },
        mount(created) {
            node = created;
            return created;
        },
        teardown() {
            if (node) {
                node.remove();
                node = null;
            }
        },
    };
}
