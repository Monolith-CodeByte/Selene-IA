import './style.css';
import './styles/login.css';
import './styles/login-error.css';
import './styles/onboarding.css';
import './styles/chat.css';
import './styles/sidebar.css';
import './styles/cookie-consent.css';
import './styles/update-banner.css';

// Componentes de la App
import { initSidebar } from './components/Sidebar';
import { initChatArea } from './components/ChatArea';
import { initSettingsModal } from './components/SettingsModal';
import { AuthService } from './services/auth';
import { UserService } from './services/user';
import { initOnboarding } from './components/Onboarding';
import { ConfirmModal } from './components/ConfirmModal';
import { ChatHistoryService } from './services/history';
import { initAFKMode } from './components/AFKMode';
import { PresenceService } from './services/presence';
import { initCookieConsent } from './components/CookieConsent';
import { initUpdateBanner } from './components/UpdateBanner';

// Componentes de la LANDING
import { Router } from './landing_comp/router.js';
import { HomePage, FeaturesPage, PrivacyPage, TermsPage, ContactPage } from './landing_comp/pages.js';

document.addEventListener('DOMContentLoaded', () => {
    let activeAppCleanup = null;
    // Generación de auth: aborta continuaciones obsoletas tras un cambio de estado
    let authGeneration = 0, loginAttempts = 0;
    // Tope de reintentos de login antes de cerrar sesión
    const MAX_ATTEMPTS = 3;
    // Verdadero si la generación ya fue superada por un evento de auth posterior
    const isStale = (g) => g !== authGeneration;
    initCookieConsent();
    initUpdateBanner();

    const routes = {
        '/': HomePage,
        '/features': FeaturesPage,
        '/privacy': PrivacyPage,
        '/terms': TermsPage,
        '/contact': ContactPage,
    };

    const landingRouter = new Router(routes);
    landingRouter.setLoginHandler(() => AuthService.loginWithGoogle());


    const cleanupActiveApp = () => {
        if (activeAppCleanup) {
            activeAppCleanup();
            activeAppCleanup = null;
        }
    };

    const proceedToApp = (finalUser) => {
        cleanupActiveApp();

        document.body.classList.remove('landing-active');
        // La landing vive solo dentro de #app; reescribir innerHTML destruye su subtree.
        // No usar selectores globales por tag: 'main' colisionaría con el shell del app.
        const app = document.getElementById('app');
        app.classList.remove('hidden');
        app.innerHTML = `
            <div class="main-layout app-active">
                <aside id="sidebar" class="sidebar"></aside>
                <main id="chat-container" class="chat-container"></main>
            </div>
        `;

        // Arranque síncrono: shell e inicializadores en la misma tarea, sin temporizador
        try {
            PresenceService.init(finalUser.uid, {
                displayName: finalUser.displayName || finalUser.preferredName || 'Usuario',
                email: finalUser.email || '',
                photoURL: finalUser.photoURL || ''
            });

            const chatController = initChatArea(finalUser);
            const settingsModal = initSettingsModal(() => AuthService.logout());
            const confirmModal = new ConfirmModal();
            initAFKMode();

            const sidebarController = initSidebar(
                () => chatController.reset(),
                () => settingsModal.open(),
                finalUser,
                async (chatId) => {
                    confirmModal.open(async () => {
                        try {
                            await ChatHistoryService.deleteChat(finalUser.uid, chatId);
                            chatController.reset();
                        } catch (err) {
                            console.error(err);
                        }
                    });
                }
            );

            activeAppCleanup = () => {
                chatController?.destroy?.();
                sidebarController?.destroy?.();
            };
        } catch (error) {
            console.error('Error critico al arrancar Elai:', error);
        }
    };

    // Error de login con reintento acotado: muestra el error o cierra sesión al tope
    const failLogin = async (user, generation, retry) => {
        loginAttempts += 1;
        if (loginAttempts >= MAX_ATTEMPTS) {
            try {
                await AuthService.logout();
            } catch (err) {
                console.error('Error al cerrar sesión tras reintentos:', err);
            }
            // La rama de cierre de sesión dibuja el landing; nada que pintar aquí
            return;
        }
        if (isStale(generation)) return;
        // Reanuda solo si no hubo un cambio de auth en el medio
        renderLoginError(async () => {
            if (isStale(generation)) return;
            await retry();
        });
    };

    // Superficie de error dentro de #app; nunca reutiliza el botón del landing
    const renderLoginError = (retry) => {
        const app = document.getElementById('app');
        app.classList.remove('hidden');
        app.innerHTML = `
            <div class="login-error">
                <h2 class="login-error__title">No pudimos cargar tu perfil</h2>
                <p class="login-error__message">Revisa tu conexión e inténtalo de nuevo.</p>
                <button id="login-retry" type="button" class="login-error__retry">Reintentar</button>
            </div>
        `;
        document.getElementById('login-retry').addEventListener('click', () => {
            retry().catch((err) => console.error('Reintento de login:', err));
        });
    };

    const onLoginSuccess = async (user, generation) => {
        let profile;
        try {
            profile = await UserService.getUserProfile(user.uid);
        } catch (err) {
            console.error('Error al cargar el perfil:', err);
            await failLogin(user, generation, () => onLoginSuccess(user, generation));
            return;
        }
        if (isStale(generation)) return;
        // La carga resolvió: reinicia los intentos acumulados
        loginAttempts = 0;

        if (!profile || !profile.onboardingComplete) {
            const app = document.getElementById('app');
            app.innerHTML = '';
            app.classList.add('hidden');

            const showOnboarding = () => {
                if (isStale(generation)) return;
                const onboardingScreen = initOnboarding(user, (updatedUser) => {
                    if (isStale(generation)) return;
                    proceedToApp(updatedUser);
                });
                document.body.appendChild(onboardingScreen);
            };

            // Reintento de creación solo: setDoc con merge es idempotente
            const attemptCreate = async () => {
                try {
                    await UserService.createUserProfile(user);
                } catch (err) {
                    console.error('Error al crear el perfil:', err);
                    await failLogin(user, generation, attemptCreate);
                    return;
                }
                if (isStale(generation)) return;
                showOnboarding();
            };

            await attemptCreate();
        } else {
            proceedToApp({ ...user, preferredName: profile.preferredName });
        }
    };

    const onSignedOut = async () => {
        cleanupActiveApp();

        const onboarding = document.querySelector('.onboarding-screen');
        if (onboarding) onboarding.remove();

        const app = document.getElementById('app');
        app.classList.add('hidden');
        document.body.classList.add('landing-active');

        landingRouter.init();
        PresenceService.cleanup().catch(() => { });
    };

    // Envoltorio no async: absorbe rechazos para que no lleguen a onAuthStateChanged
    AuthService.onUserChange((user) => {
        const generation = ++authGeneration;
        (user ? onLoginSuccess(user, generation) : onSignedOut())
            .catch((err) => console.error('Auth callback:', err));
    });
});
