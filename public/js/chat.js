// ===== AI Chat Panel =====

const Chat = {
  state: {
    messages: [],
    open: false,
    waiting: false,
  },

  async init() {
    this.bindEvents();
    await this.loadHistory();
    // Auto-greeting on first visit
    if (!localStorage.getItem('chat_greeted')) {
      setTimeout(() => this.fetchGreeting(), 1500);
    }
  },

  bindEvents() {
    // Nav entry
    const chatNav = document.querySelector('[data-nav="chat"]');
    if (chatNav) {
      chatNav.addEventListener('click', () => this.toggle());
    }

    // Close button
    const closeBtn = document.getElementById('btnChatClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Send button
    const sendBtn = document.getElementById('btnChatSend');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.handleSend());
    }

    // Enter key
    const input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleSend();
      });
    }

    // Song card add-to-queue (delegated)
    const msgContainer = document.getElementById('chatMessages');
    if (msgContainer) {
      msgContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="add-chat-song"]');
        if (!btn) return;
        const track = {
          title: btn.dataset.title,
          artist: btn.dataset.artist,
          note: btn.dataset.note || '',
          source: 'ai-chat',
        };
        API.addToRecommended(track)
          .then(() => {
            if (typeof window.refreshRecommended === 'function') window.refreshRecommended();
            if (typeof showToast === 'function') showToast('已加入推荐列表');
          })
          .catch(() => {});
      });
    }
  },

  toggle() {
    if (this.state.open) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    document.getElementById('chatDrawer').classList.add('open');
    const nav = document.querySelector('[data-nav="chat"]');
    if (nav) nav.classList.add('active');
    this.state.open = true;
    this.scrollToBottom();
  },

  close() {
    document.getElementById('chatDrawer').classList.remove('open');
    const nav = document.querySelector('[data-nav="chat"]');
    if (nav) nav.classList.remove('active');
    this.state.open = false;
  },

  async handleSend() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || this.state.waiting) return;
    input.value = '';

    // Add user message
    this.addMessage('user', text);
    this.showTyping();

    try {
      const data = await API.sendChat(text);
      this.hideTyping();
      this.addMessage('ai', data.reply, data.songs || []);
    } catch (e) {
      this.hideTyping();
      this.addMessage('ai', '抱歉，连接有点问题，请稍后再试~');
    }
  },

  async fetchGreeting() {
    try {
      const data = await API.getGreeting();
      if (data.message) {
        this.addMessage('ai', data.message);
        this.open();
        localStorage.setItem('chat_greeted', '1');
      }
    } catch (e) {
      // silent — greeting is optional
    }
  },

  async loadHistory() {
    try {
      const data = await API.getChatHistory();
      const history = data.messages || [];
      if (history.length > 0) {
        this.state.messages = history;
        this.renderMessages();
      }
    } catch (e) {
      // silent
    }
  },

  addMessage(role, content, songs) {
    this.renderMessages();
  },

  showTyping() {
    this.state.waiting = true;
    const el = document.getElementById('chatMessages');
    const empty = el.querySelector('.chat-empty');
    if (empty) empty.style.display = 'none';

    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.id = 'chatTyping';
    typing.innerHTML = '<span></span><span></span><span></span>';
    el.appendChild(typing);
    this.scrollToBottom();
  },

  hideTyping() {
    this.state.waiting = false;
    const typing = document.getElementById('chatTyping');
    if (typing) typing.remove();
  },

  renderMessages() {
    const el = document.getElementById('chatMessages');
    const empty = el.querySelector('.chat-empty');
    if (this.state.messages.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    // Only render last 50
    const msgs = this.state.messages.slice(-50);

    el.innerHTML = msgs.map((m) => {
      let html = `<div class="chat-bubble ${m.role}">`;
      html += escHtml(m.content);

      // Render song cards
      if (m.songs && m.songs.length > 0) {
        for (const song of m.songs) {
          html += `
            <div class="chat-song-card">
              <div class="chat-song-info">
                <div class="chat-song-title">${escHtml(song.title)}</div>
                <div class="chat-song-artist">${escHtml(song.artist)}</div>
                ${song.note ? `<div class="chat-song-note">${escHtml(song.note)}</div>` : ''}
              </div>
              <button class="btn-sm-icon" data-action="add-chat-song"
                data-title="${escHtml(song.title)}" data-artist="${escHtml(song.artist)}"
                data-note="${escHtml(song.note || '')}" title="加入推荐">+</button>
            </div>`;
        }
      }

      html += '</div>';
      return html;
    }).join('');

    this.scrollToBottom();
  },

  scrollToBottom() {
    requestAnimationFrame(() => {
      const el = document.getElementById('chatMessages');
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
};
