export const GENERATED_PROJECT_KNOWLEDGE = {
  "generatedAt": "2026-10-24T19:45:47.664Z",
  "detectedRoutes": [
    "/ -> HomePage",
    "/contact -> ContactPage",
    "/features -> FeaturesPage",
    "/privacy -> PrivacyPage",
    "/terms -> TermsPage"
  ],
  "componentFiles": [
    "src/components/AFKMode.js",
    "src/components/ChatArea.js",
    "src/components/ConfirmModal.js",
    "src/components/CookieConsent.js",
    "src/components/InputArea.js",
    "src/components/LoginScreen.js",
    "src/components/Onboarding.js",
    "src/components/PrivacyPolicyModal.js",
    "src/components/SettingsModal.js",
    "src/components/Sidebar.js",
    "src/components/UpdateBanner.js"
  ],
  "serviceFiles": [
    "src/services/api.js",
    "src/services/auth.js",
    "src/services/gemini.js",
    "src/services/history.js",
    "src/services/presence.js",
    "src/services/profileFields.js",
    "src/services/user.js"
  ],
  "landingFiles": [
    "src/landing_comp/components.js",
    "src/landing_comp/pages.js",
    "src/landing_comp/router.js"
  ],
  "integrations": [
    "Cloud Firestore integration",
    "Firebase Authentication integration",
    "Google AdSense integration",
    "Google Sign-In provider"
  ],
  "detectedFeatures": [
    "ads.txt file is present in public assets for AdSense setup",
    "Animation toggle setting",
    "Chat history is persisted and streamed from Firestore",
    "Cookie consent preferences are stored locally before enabling ads",
    "Font size setting",
    "Google login flow is wired from the landing page into the app",
    "Logout action in settings",
    "Onboarding flow exists before entering the main app experience",
    "Sidebar includes a dedicated mobile menu toggle",
    "Typing speed setting",
    "Users can delete chat conversations from the sidebar"
  ],
  "limitations": [
    "Ad consent is stored per browser through localStorage, not per authenticated account",
    "Image upload button is present in the UI but currently unavailable",
    "Input placeholder text adapts for smaller mobile widths",
    "Microphone button is present in the UI but currently unavailable"
  ]
};
