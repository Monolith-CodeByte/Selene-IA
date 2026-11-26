import { initInputArea } from './InputArea';
import { GeminiService } from '../services/gemini';
import { ChatHistoryService } from '../services/history';
import {
  USER_SAVE_FAILURE_MESSAGE,
  classifyAiFailure,
  persistFailedAiMessage,
  shouldRenderPersistedFailure,
} from '../services/chatFailure';
import { getAuth } from 'firebase/auth';

export function initChatArea(user) {
  const chatContainer = document.getElementById('chat-container');
  let currentChatId = null;
  let messagesUnsubscribe = null;

  let chatSession;
  try {
    chatSession = GeminiService.startChat();
  } catch (e) {
    console.error('Failed to start chat session', e);
  }

  const messagesArea = document.createElement('div');
  messagesArea.className = 'messages-area';

  const createWelcomeHero = () => {
    const hero = document.createElement('div');
    const nameToUse = user.preferredName || user.displayName || 'Human';
    const userName = nameToUse.split(' ')[0];

    hero.className = 'welcome-hero';
    hero.innerHTML = `
      <div class="greeting">
        <span class="gradient-text">Hola, ${userName}</span>
        <span class="sub-text">¿En qué puedo ayudarte hoy?</span>
      </div>
      <div class="suggestions-grid">
        <div class="suggestion-card">
          <p>Explícame este código</p>
          <div class="icon-box">
             <svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"></path></svg>
          </div>
        </div>
        <div class="suggestion-card">
          <p>Ayúdame a escribir un correo</p>
          <div class="icon-box">
             <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"></path></svg>
          </div>
        </div>
        <div class="suggestion-card">
          <p>Crea un plan de estudio</p>
          <div class="icon-box">
             <svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"></path></svg>
          </div>
        </div>
        <div class="suggestion-card">
          <p>Genera ideas para un blog</p>
          <div class="icon-box">
             <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"></path></svg>
          </div>
        </div>
      </div>
    `;
    return hero;
  };

  let welcomeHero = createWelcomeHero();
  messagesArea.appendChild(welcomeHero);
  chatContainer.appendChild(messagesArea);

  let renderedMessageIds = new Set();

  const loadChat = (chatId) => {
    currentChatId = chatId;
    messagesArea.innerHTML = '';
    renderedMessageIds.clear();
    if (welcomeHero) welcomeHero.remove();

    if (messagesUnsubscribe) messagesUnsubscribe();

    messagesUnsubscribe = ChatHistoryService.subscribeToMessages(user.uid, chatId, (messages) => {
      messages.forEach((msg) => {
        if (!renderedMessageIds.has(msg.id)) {
          renderedMessageIds.add(msg.id);
          appendMessage(messagesArea, msg.text, msg.role, false);
        }
      });

      messagesArea.scrollTop = messagesArea.scrollHeight;
    });

    chatSession = GeminiService.startChat();
  };

  const loadChatHandler = (e) => {
    const chatId = e.detail.chatId;
    loadChat(chatId);
  };
  document.addEventListener('load-chat', loadChatHandler);

  const onSend = async (text) => {
    if (welcomeHero && welcomeHero.parentNode) {
      welcomeHero.remove();
    }

    const tempUserMsgId = `temp-user-${Date.now()}`;

    appendMessage(messagesArea, text, 'user');
    renderedMessageIds.add(tempUserMsgId);

    let targetChatId = currentChatId;
    const isNewChat = !targetChatId;

    try {
      const result = await ChatHistoryService.saveMessage(user.uid, targetChatId, text, 'user');
      const savedChatId = result.chatId || result;
      const savedMsgId = result.messageId;

      if (savedMsgId) {
        renderedMessageIds.delete(tempUserMsgId);
        renderedMessageIds.add(savedMsgId);
      }

      if (!targetChatId) {
        targetChatId = savedChatId;
        if (!currentChatId) {
          currentChatId = targetChatId;
        }
      }

      if (isNewChat && targetChatId) {
        (async () => {
          const auth = getAuth();
          const currentUser = auth.currentUser;
          const idToken = currentUser ? await currentUser.getIdToken(true) : null;
          const title = await GeminiService.generateTitle(text, idToken);
          await ChatHistoryService.updateChatTitle(user.uid, targetChatId, title);
        })();
      }
    } catch (dbError) {
      console.error('Firestore Error (User Msg):', dbError);
      appendMessage(messagesArea, USER_SAVE_FAILURE_MESSAGE, 'ai');
      return;
    }

    if (currentChatId === targetChatId) {
      showLoading(messagesArea);
    }

    try {
      if (!chatSession) {
        chatSession = GeminiService.startChat();
      }

      const auth = getAuth();
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken(true) : null;

      const result = await chatSession.sendMessage(text, idToken);
      const response = await result.response;
      const textResponse = response.text();

      if (currentChatId === targetChatId) {
        removeLoading(messagesArea);
      }

      const aiResult = await ChatHistoryService.saveMessage(user.uid, targetChatId, textResponse, 'ai');

      if (aiResult.messageId) {
        renderedMessageIds.add(aiResult.messageId);
      }

      if (currentChatId === targetChatId) {
        appendMessage(messagesArea, textResponse, 'ai');
      }
    } catch (error) {
      console.error('Gemini Error:', error);
      if (currentChatId === targetChatId) {
        removeLoading(messagesArea);
      }

      const failureMessage = classifyAiFailure(error);
      let persistedFailure = null;
      try {
        persistedFailure = await persistFailedAiMessage({
          userId: user.uid,
          chatId: targetChatId,
          saveMessage: ChatHistoryService.saveMessage,
          message: failureMessage,
        });
        if (persistedFailure?.messageId) {
          renderedMessageIds.add(persistedFailure.messageId);
        }
      } catch (persistError) {
        console.error('Failed to persist AI error message:', persistError);
      }

      if (shouldRenderPersistedFailure({
        isCurrentChat: currentChatId === targetChatId,
        messageId: persistedFailure?.messageId,
      })) {
        appendMessage(messagesArea, failureMessage, 'ai');
      }
    }
  };

  const { element: inputElement, addChip, destroy: destroyInput } = initInputArea(onSend);
  chatContainer.appendChild(inputElement);

  const attachSuggestionListeners = () => {
    const cards = messagesArea.querySelectorAll('.suggestion-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const text = card.querySelector('p').innerText;
        const icon = card.querySelector('.icon-box').innerHTML;
        addChip(text, icon);

        const input = document.getElementById('chat-input');
        if (input) input.focus();
      });
    });
  };
  attachSuggestionListeners();

  return {
    reset: () => {
      messagesArea.innerHTML = '';
      currentChatId = null;
      renderedMessageIds.clear();
      if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
      }

      welcomeHero = createWelcomeHero();
      messagesArea.appendChild(welcomeHero);
      attachSuggestionListeners();
      chatSession = GeminiService.startChat();

      const all = document.querySelectorAll('.chat-item');
      all.forEach((x) => x.classList.remove('active'));
    },
    destroy: () => {
      if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
      }
      document.removeEventListener('load-chat', loadChatHandler);
      destroyInput?.();
      chatContainer.innerHTML = '';
    }
  };
}

function appendMessage(container, text, role, animate = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}-message`;

  const icon = role === 'ai'
    ? '<div class="ai-icon"><img src="/vite.svg" alt="AI" /></div>'
    : '';

  msgDiv.innerHTML = `
    ${role === 'ai' ? icon : ''}
    <div class="message-content">
        ${role === 'ai' ? '<div class="sender-name">Selene</div>' : ''}
        <div class="text"></div>
    </div>
  `;

  container.appendChild(msgDiv);

  const textContainer = msgDiv.querySelector('.text');
  if (role === 'ai' && animate) {
    typeText(textContainer, text);
  } else {
    renderMessageText(textContainer, text, role);
  }

  container.scrollTop = container.scrollHeight;
}

function showLoading(container) {
  const loader = document.createElement('div');
  loader.id = 'ai-loader';
  loader.className = 'message ai-message loading';
  loader.innerHTML = `
     <div class="ai-icon"><img src="/vite.svg" alt="AI" /></div>
     <div class="message-content">
        <div class="sender-name">Selene</div>
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
     </div>
  `;
  container.appendChild(loader);
  container.scrollTop = container.scrollHeight;
}

function removeLoading(container) {
  const loader = container.querySelector('#ai-loader');
  if (loader) loader.remove();
}

function typeText(element, text, speed = 20) {
  if (window.SELENE_SETTINGS && window.SELENE_SETTINGS.typingSpeed) {
    speed = window.SELENE_SETTINGS.typingSpeed;
  }

  let i = 0;
  const timer = setInterval(() => {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      const container = element.closest('.messages-area');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      clearInterval(timer);
      renderMessageText(element, text, 'ai');
    }
  }, speed);
}

function renderMessageText(element, text, role) {
  if (role !== 'ai') {
    element.textContent = text;
    return;
  }

  element.innerHTML = formatAiMessage(text);
}

function formatAiMessage(text) {
  const lines = text.split('\n');
  const chunks = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    chunks.push(`<ul>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      chunks.push('<br>');
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    if (/^##\s+/.test(trimmed)) {
      flushList();
      chunks.push(`<h3>${formatInline(trimmed.replace(/^##\s+/, ''))}</h3>`);
      return;
    }

    flushList();
    chunks.push(`<p>${formatInline(trimmed)}</p>`);
  });

  flushList();

  return chunks.join('');
}

function formatInline(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
