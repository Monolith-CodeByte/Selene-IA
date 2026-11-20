import { UserService } from '../services/user';
import { buildOnboardingProfilePayload } from '../services/onboardingProfile';

export function initOnboarding(user, onComplete) {
    const container = document.createElement('div');
    container.className = 'onboarding-container fade-in';

    // State
    let step = 1;
    let preferredName = user.displayName ? user.displayName.split(' ')[0] : '';
    let discoverySource = '';

    // Render function
    const render = () => {
        container.innerHTML = '';
        const content = document.createElement('div');
        content.className = 'onboarding-content';

        if (step === 1) {
            content.innerHTML = `
                <div class="step-indicator">Paso 1 de 3</div>
                <h1 class="gradient-text">¡Hola! Antes de empezar...</h1>
                <p class="onboarding-desc">¿Tienes algún nombre preferido que quieras que use? O, ¿cómo quieres que te diga?</p>
                
                <div class="input-group">
                    <input type="text" id="name-input" placeholder="Tu nombre (ej. Luis)" value="${preferredName}" />
                    <span class="input-hint">Si lo dejas vacío, usaré "${user.displayName || 'Humano'}".</span>
                </div>

                <button id="next-btn" class="primary-btn">Siguiente</button>
            `;
        } else if (step === 2) {
            content.innerHTML = `
                <div class="step-indicator">Paso 2 de 3</div>
                <h1>¿Cómo nos conociste?</h1>
                <p class="onboarding-desc">Nos interesa saber cómo llegaste a Selene.</p>

                <div class="input-group">
                    <div class="usage-options">
                        <button class="usage-btn" data-value="friend">Amigo / Recomendación</button>
                        <button class="usage-btn" data-value="social">Redes Sociales (X, Instagram)</button>
                        <button class="usage-btn" data-value="youtube">YouTube / Video</button>
                        <button class="usage-btn" data-value="search">Buscador</button>
                        <button class="usage-btn" data-value="other">Otro</button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="next-step-2" class="primary-btn">Siguiente</button>
                </div>
            `;
        } else if (step === 3) {
            content.innerHTML = `
                <div class="step-indicator">Paso 3 de 3</div>
                <h1>Un poco más sobre ti</h1>
                <p class="onboarding-desc">Esto me ayuda a personalizar mi asistencia. (Opcional)</p>

                <div class="input-group">
                    <label>¿Para qué usarás principalmente este chat?</label>
                    <div class="usage-options">
                        <button class="usage-btn" data-value="learning">Aprender</button>
                        <button class="usage-btn" data-value="coding">Programar</button>
                        <button class="usage-btn" data-value="creative">Creatividad</button>
                        <button class="usage-btn" data-value="work">Trabajo</button>
                    </div>
                </div>

                <button id="finish-btn" class="primary-btn">Comenzar</button>
            `;
        }

        container.appendChild(content);
        setupListeners(content);
    };

    const setupListeners = (content) => {
        if (step === 1) {
            const input = content.querySelector('#name-input');
            const nextBtn = content.querySelector('#next-btn');

            input.focus();
            const goNext = () => {
                const val = input.value.trim();
                preferredName = val || (user.displayName || 'Humano');
                step = 2;
                render();
            };

            nextBtn.onclick = goNext;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') goNext();
            };

        } else if (step === 2) {
            const nextBtn = content.querySelector('#next-step-2');
            const options = content.querySelectorAll('.usage-btn');

            options.forEach(btn => {
                if (btn.dataset.value === discoverySource) btn.classList.add('selected');

                btn.onclick = () => {
                    options.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    discoverySource = btn.dataset.value;
                };
            });

            nextBtn.onclick = () => {
                step = 3;
                render();
            };

        } else if (step === 3) {
            const finishBtn = content.querySelector('#finish-btn');
            const usageBtns = content.querySelectorAll('.usage-btn');
            let selectedUsage = null;

            usageBtns.forEach(btn => {
                btn.onclick = () => {
                    usageBtns.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    selectedUsage = btn.dataset.value;
                };
            });

            finishBtn.onclick = async () => {
                finishBtn.innerHTML = '<span class="loader"></span> Guardando...';
                finishBtn.disabled = true;

                try {
                    // Save to Firestore
                    await UserService.updateUserProfile(
                        user.uid,
                        buildOnboardingProfilePayload({
                            preferredName,
                            discoverySource,
                            usageIntent: selectedUsage,
                        })
                    );

                    // Animate out
                    container.classList.add('fade-out');
                    setTimeout(() => {
                        container.remove();
                        // Pass the updated user object
                        const enrichedUser = { ...user, preferredName };
                        onComplete(enrichedUser);
                    }, 500);

                } catch (error) {
                    console.error("Save failed", error);
                    finishBtn.textContent = 'Error. Intenta de nuevo.';
                    finishBtn.disabled = false;
                }
            };
        }
    };

    // Initial render
    setTimeout(render, 100); // Slight delay for fade in
    return container;
}
