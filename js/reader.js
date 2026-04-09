/* ═══════════════════════════════════════
   READER.JS - 阅读、划词、进度记忆
   ═══════════════════════════════════════ */

const Reader = {
  currentBook: null,
  currentNoteId: null,
  selectedText: '',
  selectedRange: null,
  // 分页模式状态
  _paginationMode: false, // true=分页, false=滚动
  _currentPage: 0,
  _totalPages: 1,
  _pageWidth: 0,

  // ─── 打开阅读器 ───
  async open(bookId) {
    const book = await Store.get('books', bookId);
    if (!book) return;

    this.currentBook = book;
    
    // 恢复排版设置
    this.restoreTypography();
    
    // 显示阅读器
    document.getElementById('reader-overlay').classList.add('active');
    document.getElementById('reader-title').textContent = book.title;
    
    // 渲染内容（优先使用 htmlContent 富文本）
    this.renderContent(book.content, book.htmlContent);
    
    // 应用分页模式（如果已开启）
    if (this._paginationMode) {
      // 设置待恢复的页码，enablePagination → recalcPages 完成后会 goToPage
      this._currentPage = book.currentPage || 0;
      this.enablePagination();
    } else {
      // 滚动模式：绑定滚动监听并恢复位置
      this._scrollHandler = () => this.updateProgress();
      document.getElementById('reader-content').addEventListener('scroll', this._scrollHandler, { passive: true });
      setTimeout(() => {
        const content = document.getElementById('reader-content');
        content.scrollTop = book.scrollPosition || 0;
        this.updateProgress();
      }, 100);
    }

    // 恢复高亮
    await this.restoreHighlights(bookId);
  },

  // ─── 关闭阅读器 ───
  close() {
    // 保存阅读位置
    if (this.currentBook) {
      if (this._paginationMode) {
        this.currentBook.currentPage = this._currentPage;
      } else {
        this.currentBook.scrollPosition = document.getElementById('reader-content').scrollTop;
      }
      Store.put('books', this.currentBook);
    }

    // 清理分页模式
    if (this._paginationMode) {
      this._removeTapZones();
      this._removeSwipeGesture();
      this._removeKeyboardNav();
      const indicator = document.getElementById('page-indicator');
      if (indicator) indicator.classList.remove('active');
      const container = document.getElementById('reader-content');
      container.classList.remove('paginated', 'dual-page');
      // 解包 page-columns
      const wrapper = container.querySelector('.page-columns');
      if (wrapper) {
        wrapper.style.transform = '';
        while (wrapper.firstChild) container.appendChild(wrapper.firstChild);
        wrapper.remove();
      }
    }

    // 移除滚动监听
    if (this._scrollHandler) {
      document.getElementById('reader-content').removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }

    // 关闭阅读器和所有子面板
    document.getElementById('reader-overlay').classList.remove('active');
    document.getElementById('selection-dock').classList.remove('active');
    this.closeAIChat();
    this.closeMemoryPanel();
    document.getElementById('toc-panel').classList.remove('active');
    
    this.currentBook = null;
    this.currentNoteId = null;
  },

  // ─── 更新进度条 ───
  updateProgress() {
    let progress = 0;
    if (this._paginationMode) {
      progress = this._totalPages > 1 ? this._currentPage / (this._totalPages - 1) : 0;
    } else {
      const content = document.getElementById('reader-content');
      const scrollable = content.scrollHeight - content.clientHeight;
      progress = scrollable > 0 ? content.scrollTop / scrollable : 0;
    }
    document.getElementById('reader-progress-bar').style.width = (progress * 100) + '%';
  },

  // ─── 渲染正文 ───
  renderContent(content, htmlContent) {
    const container = document.getElementById('reader-content');
    
    // 兼容 content 为 undefined/null（PDF canvas 模式或数据异常）
    if (!content && !htmlContent) {
      container.innerHTML = '<p style="color:var(--ink-faint);text-align:center;padding:40px 0;">暂无正文内容</p>';
      return;
    }

    // EPUB 富文本模式：直接注入安全过滤后的 HTML
    if (htmlContent) {
      container.innerHTML = htmlContent;
      container.classList.add('epub-content');
      container.classList.remove('txt-content');
      return;
    }

    // TXT / 纯文本模式
    container.classList.add('txt-content');
    container.classList.remove('epub-content');
    const paragraphs = content.split(/\n+/).filter(p => p.trim());
    const html = paragraphs.map(p => {
      const trimmed = p.trim();
      const escaped = this.escapeHtml(trimmed);
      // 识别标题（以 # 开头）
      if (trimmed.startsWith('### ')) return `<h3>${escaped.slice(4)}</h3>`;
      if (trimmed.startsWith('## '))  return `<h2>${escaped.slice(3)}</h2>`;
      if (trimmed.startsWith('# '))   return `<h1>${escaped.slice(2)}</h1>`;
      // 识别中文章节标题（复用 _tocPatterns）
      if (this._tocPatterns.some(re => re.test(trimmed))) {
        return `<h2 class="chapter-title">${escaped}</h2>`;
      }
      return `<p>${escaped}</p>`;
    }).join('');
    
    container.innerHTML = html;
  },

  // ─── 恢复高亮 ───
  async restoreHighlights(bookId) {
    const notes = await Store.getAll('notes');
    const bookNotes = notes.filter(n => n.bookId === bookId && n.quote);
    if (!bookNotes.length) return;

    const container = document.getElementById('reader-content');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    bookNotes.forEach(note => {
      for (const tn of textNodes) {
        const idx = tn.nodeValue.indexOf(note.quote);
        if (idx !== -1) {
          try {
            const range = document.createRange();
            range.setStart(tn, idx);
            range.setEnd(tn, idx + note.quote.length);
            const mark = document.createElement('mark');
            mark.className = 'text-selected';
            mark.dataset.noteId = note.id;
            mark.addEventListener('click', () => this.openAIChat(note.id));
            range.surroundContents(mark);
          } catch (e) {
            // 跨节点选择跳过，不影响其他笔记恢复
          }
          break;
        }
      }
    });
  },

  // ─── 章节标题正则（匹配 <p> 内容） ───
  _tocPatterns: [
    /^第[零一二三四五六七八九十百千万\d]+[章回节卷部].{0,30}$/,
    /^Chapter\s*\d+.*/i,
    /^(引子|番外|前言|序言|尾声|后记)$/,
    /^[一二三四五六七八九十百千万]+[\s\u3000].{1,25}$/
  ],

  // ─── 显示目录 ───
  showTOC() {
    const panel = document.getElementById('toc-panel');
    const list = document.getElementById('toc-list');
    const container = document.getElementById('reader-content');

    // 收集目录条目：h1/h2/h3 + 正则匹配的 <p>
    const tocEntries = [];

    // 1. 扫描 h1/h2/h3
    container.querySelectorAll('h1, h2, h3').forEach(h => {
      const level = parseInt(h.tagName[1]);
      tocEntries.push({ el: h, text: h.textContent.trim(), level });
    });

    // 2. 扫描 <p>，正则匹配章节标题，并过滤掉目录页区间
    const allPs = Array.from(container.querySelectorAll('p'));
    // 先标记每个 <p> 是否命中标题正则
    const matchFlags = allPs.map(p => {
      const text = p.textContent.trim();
      return text ? this._tocPatterns.some(re => re.test(text)) : false;
    });

    // 检测目录页区间：连续 5+ 个命中的段落视为目录页，整段跳过
    const tocPageSet = new Set();
    let streak = 0;
    let streakStart = 0;
    for (let i = 0; i <= matchFlags.length; i++) {
      if (i < matchFlags.length && matchFlags[i]) {
        if (streak === 0) streakStart = i;
        streak++;
      } else {
        if (streak >= 5) {
          for (let j = streakStart; j < streakStart + streak; j++) {
            tocPageSet.add(j);
          }
        }
        streak = 0;
      }
    }

    let tocIdCounter = 0;
    allPs.forEach((p, i) => {
      if (!matchFlags[i] || tocPageSet.has(i)) return;
      const text = p.textContent.trim();
      const tocId = `toc-${tocIdCounter++}`;
      p.id = tocId;
      tocEntries.push({ el: p, text, level: 2, tocId });
    });

    // 按 DOM 顺序排序（避免 h 和 p 交叉乱序）
    tocEntries.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    if (tocEntries.length === 0) {
      list.innerHTML = '<div class="toc-empty">本书暂未识别到目录结构，可尝试使用标题格式（# 标题）来组织章节。</div>';
    } else {
      list.innerHTML = tocEntries.map((entry, i) => {
        const indent = (entry.level - 1) * 12;
        return `<div class="toc-item" style="padding-left: ${20 + indent}px;" onclick="Reader.scrollToTocEntry(${i})">${Reader.escapeHtml(entry.text)}</div>`;
      }).join('');
    }

    // 缓存条目引用供滚动使用
    this._tocEntries = tocEntries;

    panel.classList.add('active');
  },

  // ─── 滚动到目录条目 ───
  scrollToTocEntry(index) {
    const entry = this._tocEntries && this._tocEntries[index];
    if (entry && entry.el) {
      if (this._paginationMode) {
        // 分页模式：计算元素所在页码
        const elLeft = entry.el.offsetLeft;
        const page = Math.floor(elLeft / this._pageWidth);
        this.goToPage(page);
      } else {
        entry.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    document.getElementById('toc-panel').classList.remove('active');
  },

  // ─── 打开本书大脑面板 ───
  showMemoryPanel() {
    if (!this.currentBook) return;

    // 填充书籍背景
    document.getElementById('memory-context').value = this.currentBook.context || '';

    // 渲染记忆卡片
    this.renderMemoryCards();

    // 显示面板
    document.getElementById('memory-panel').classList.add('active');
    document.getElementById('memory-panel-backdrop').classList.add('active');
  },

  // ─── 保存书籍背景（textarea onblur 触发） ───
  async saveContext() {
    if (!this.currentBook) return;
    this.currentBook.context = document.getElementById('memory-context').value;
    await Store.put('books', this.currentBook);
  },

  // ─── 关闭本书大脑面板 ───
  closeMemoryPanel() {
    // 关闭前保存背景（以防用户未触发 blur）
    if (this.currentBook) {
      const contextEl = document.getElementById('memory-context');
      this.currentBook.context = contextEl.value;
      Store.put('books', this.currentBook);
    }
    document.getElementById('memory-panel').classList.remove('active');
    document.getElementById('memory-panel-backdrop').classList.remove('active');
  },

  // ─── 渲染记忆卡片列表 ───
  renderMemoryCards() {
    const list = document.getElementById('memory-card-list');
    const memories = this.currentBook?.memories || [];

    if (memories.length === 0) {
      list.innerHTML = '<div style="font-size:0.78rem;font-weight:300;color:var(--ink-faint);padding:12px 0;">暂无记忆，可手动添加或从对话中提炼。</div>';
      return;
    }

    list.innerHTML = memories.map((m, i) => `
      <div style="position:relative;">
        <div class="memory-card" contenteditable="true"
             onblur="Reader.updateMemoryCard(${i}, this.innerText)">${this.escapeHtml(m)}</div>
        <span class="memory-card-del" onclick="Reader.deleteMemoryCard(${i})">×</span>
      </div>
    `).join('');
  },

  // ─── 更新记忆卡片 ───
  async updateMemoryCard(index, text) {
    if (!this.currentBook) return;
    if (!this.currentBook.memories) this.currentBook.memories = [];
    this.currentBook.memories[index] = text.trim();
    await Store.put('books', this.currentBook);
  },

  // ─── 删除记忆卡片 ───
  async deleteMemoryCard(index) {
    if (!this.currentBook) return;
    this.currentBook.memories = (this.currentBook.memories || []).filter((_, i) => i !== index);
    await Store.put('books', this.currentBook);
    this.renderMemoryCards();
  },

  // ─── 手动添加空记忆 ───
  async addEmptyMemory() {
    if (!this.currentBook) return;
    if (!this.currentBook.memories) this.currentBook.memories = [];
    this.currentBook.memories.push('');
    await Store.put('books', this.currentBook);
    this.renderMemoryCards();
    // 聚焦最后一张卡片
    setTimeout(() => {
      const cards = document.querySelectorAll('#memory-card-list .memory-card');
      const last = cards[cards.length - 1];
      if (last) last.focus();
    }, 50);
  },

  // ─── AI 自动提取全书背景 ───
  async autoExtractContext() {
    if (!this.currentBook) return;

    const btn = document.getElementById('memory-auto-extract');
    btn.disabled = true;
    btn.textContent = '正在分析…';

    App.log('info', 'Reader', `autoExtractContext: 《${this.currentBook.title}》`);

    try {
      const cleanTitle = (this.currentBook.title || '')
        .replace(/\.(txt|pdf|epub)$/i, '')
        .replace(/[\[\(].*?[\]\)]/g, '')
        .trim();
      const contentPreview = (this.currentBook.content || '').slice(0, 2500);

      const messages = [
        {
          role: 'system',
          content: '你是文学评论家。优先从知识库检索该书。如果不知道，根据开头推断。'
        },
        {
          role: 'user',
          content: `分析书籍《${cleanTitle}》。\n直接介绍核心剧情、人物关系和看点（300字）。\n如不知道，根据开头推断：\n${contentPreview}`
        }
      ];

      const contextEl = document.getElementById('memory-context');
      contextEl.value = '';
      let result = '';

      await AI.callStream(
        messages,
        (chunk) => {
          result += chunk;
          contextEl.value = result;
        },
        async () => {
          this.currentBook.context = result.trim();
          await Store.put('books', this.currentBook);
          btn.textContent = 'AI 自动提取全书背景';
          btn.disabled = false;
          App.log('info', 'Reader', '背景提取完成');
          App.showToast('背景分析完成');
        },
        (err) => {
          btn.textContent = 'AI 自动提取全书背景';
          btn.disabled = false;
          App.log('error', 'Reader', '背景提取失败: ' + err.message, err);
          App.showToast('分析失败：' + err.message);
        }
      );
    } catch (e) {
      btn.textContent = 'AI 自动提取全书背景';
      btn.disabled = false;
      App.log('error', 'Reader', '背景提取异常: ' + e.message, e);
      App.showToast('分析失败：' + e.message);
    }
  },

  // ─── 删除记忆（兼容旧调用） ───
  async deleteMemory(index) {
    if (!this.currentBook) return;
    this.currentBook.memories = (this.currentBook.memories || []).filter((_, i) => i !== index);
    await Store.put('books', this.currentBook);
  },

  // ─── 处理文本选择 ───
  handleSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      document.getElementById('selection-dock').classList.remove('active');
      return;
    }

    this.selectedText = selection.toString().trim();
    if (this.selectedText.length > 0) {
      this.selectedRange = selection.getRangeAt(0).cloneRange();
      document.getElementById('selection-dock').classList.add('active');
    } else {
      document.getElementById('selection-dock').classList.remove('active');
    }
  },

  // ─── 创建笔记 ───
  async createNote(type = 'note') {
    if (!this.selectedText || !this.currentBook) return;

    const note = {
      bookId: this.currentBook.id,
      quote: this.selectedText,
      type: type,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const noteId = await Store.put('notes', note);
    
    // 高亮文本
    this.highlightText(this.selectedRange, noteId);
    
    // 清除选择
    window.getSelection().removeAllRanges();
    document.getElementById('selection-dock').classList.remove('active');
    this.selectedText = '';
    this.selectedRange = null;

    if (type === 'ai') {
      await this.openAIChat(noteId);
      // 自动发起第一条消息
      this.sendAIMessage(`我读到了这段：\n"${note.quote}"\n\n你怎么看？`);
    } else {
      App.showToast('已存入笔记');
    }

    return noteId;
  },

  // ─── 高亮文本 ───
  highlightText(range, noteId) {
    if (!range) return;
    const mark = document.createElement('mark');
    mark.className = 'text-selected';
    mark.dataset.noteId = noteId;
    mark.addEventListener('click', () => this.openAIChat(noteId));
    
    try {
      range.surroundContents(mark);
    } catch (e) {
      // 跨节点选择降级处理
      console.warn('高亮失败（跨节点）:', e);
    }
  },

  // ─── 打开 AI 对话 ───
  async openAIChat(noteId) {
    const note = await Store.get('notes', noteId);
    if (!note) return;

    this.currentNoteId = noteId;
    
    // 设置引用原句
    const quoteEl = document.getElementById('sidebar-quote');
    quoteEl.textContent = note.quote || '';
    
    // 渲染对话历史
    this.renderMessages(note.messages);

    // 记忆条数提示（超过 8 条显示警告）
    const memories = this.currentBook?.memories || [];
    const warningEl = document.getElementById('memory-warning');
    if (memories.length > 8) {
      warningEl.classList.add('visible');
    } else {
      warningEl.classList.remove('visible');
    }
    
    // 显示侧边栏
    document.getElementById('ai-sidebar').classList.add('active');
    document.getElementById('ai-sidebar-backdrop').classList.add('active');
    
    // 聚焦输入框
    setTimeout(() => document.getElementById('chat-input').focus(), 300);
  },

  // ─── 关闭 AI 对话 ───
  closeAIChat() {
    document.getElementById('ai-sidebar').classList.remove('active');
    document.getElementById('ai-sidebar-backdrop').classList.remove('active');
    this.currentNoteId = null;
  },

  // ─── 渲染消息列表 ───
  renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    messages.forEach((msg, i) => {
      const div = document.createElement('div');
      div.className = `chat-message ${msg.role}`;
      div.innerHTML = `
        <div class="message-content">${this.formatText(msg.content)}</div>
        <div class="message-actions">
          <span class="msg-action" onclick="Reader.copyMessage(${i})">复制</span>
          <span class="msg-action" onclick="Reader.deleteMessage(${i})">删除</span>
        </div>
      `;
      container.appendChild(div);
    });

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
  },

  // ─── 从输入框发送消息（UI 触发） ───
  sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    this.sendAIMessage(text);
  },

  // ─── 发送 AI 消息 ───
  async sendAIMessage(userMessage) {
    if (!this.currentNoteId) return;
    const note = await Store.get('notes', this.currentNoteId);
    if (!note) return;

    // 添加用户消息
    note.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });
    await Store.put('notes', note);
    this.renderMessages(note.messages);

    // 构建上下文（含书籍记忆注入）
    const bookContext = this.currentBook?.context || '';
    const readingContext = this.getReadingContext(note.quote);
    const memories = this.currentBook?.memories || [];

    const messages = AI.buildContext(
      note.messages.map(m => ({ role: m.role, content: m.content })),
      bookContext,
      readingContext,
      memories
    );

    // 加载占位
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message ai';
    loadingDiv.innerHTML = '<div class="message-content" style="color: var(--ink-faint);">思考中…</div>';
    document.getElementById('chat-messages').appendChild(loadingDiv);
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

    let aiResponse = '';

    await AI.callStream(
      messages,
      (chunk) => {
        aiResponse += chunk;
        loadingDiv.querySelector('.message-content').textContent = aiResponse;
        document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
      },
      async () => {
        note.messages.push({
          role: 'ai',
          content: aiResponse,
          timestamp: Date.now()
        });
        note.updatedAt = Date.now();
        await Store.put('notes', note);
        this.renderMessages(note.messages);
      },
      (error) => {
        loadingDiv.querySelector('.message-content').textContent = `错误：${error.message}`;
        loadingDiv.querySelector('.message-content').style.color = 'var(--ink-faint)';
      }
    );
  },

  // ─── 提炼记忆 ───
  async summarizeThread() {
    if (!this.currentNoteId || !this.currentBook) return;
    const note = await Store.get('notes', this.currentNoteId);
    if (!note || note.messages.length === 0) {
      App.showToast('暂无对话可提炼');
      return;
    }

    App.showToast('正在提炼记忆…');
    
    try {
      const summaryPrompt = [
        {
          role: 'user',
          content: `请将以下关于书籍片段的对话提炼为一句简洁的记忆要点（30字以内）：\n\n原文：${note.quote}\n\n对话：${note.messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`).join('\n')}`
        }
      ];

      let summary = '';
      await AI.callStream(
        summaryPrompt,
        (chunk) => { summary += chunk; },
        async () => {
          if (!this.currentBook.memories) this.currentBook.memories = [];
          this.currentBook.memories.push(summary.trim());
          await Store.put('books', this.currentBook);
          App.showToast('记忆已提炼');
        },
        (err) => App.showToast('提炼失败：' + err.message)
      );
    } catch (e) {
      App.showToast('提炼失败：' + e.message);
    }
  },

  // ─── 获取阅读上下文（前后各 500 字） ───
  getReadingContext(quote) {
    const content = this.currentBook?.content;
    if (!content || !quote) return '';
    
    const index = content.indexOf(quote);
    if (index === -1) return '';

    const start = Math.max(0, index - 500);
    const end = Math.min(content.length, index + quote.length + 500);
    
    return content.substring(start, end);
  },

  // ─── 复制消息 ───
  async copyMessage(index) {
    const note = await Store.get('notes', this.currentNoteId);
    if (!note || !note.messages[index]) return;
    navigator.clipboard.writeText(note.messages[index].content);
    App.showToast('已复制');
  },

  // ─── 删除消息 ───
  async deleteMessage(index) {
    const note = await Store.get('notes', this.currentNoteId);
    if (!note) return;
    note.messages.splice(index, 1);
    note.updatedAt = Date.now();
    await Store.put('notes', note);
    this.renderMessages(note.messages);
  },

  // ─── 工具函数 ───
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatText(text) {
    return this.escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },

  // ─── 排版快捷面板 ───
  showTypography() {
    // 同步当前 CSS 变量值到按钮和滑块
    const root = document.documentElement;
    const curSize = getComputedStyle(root).getPropertyValue('--read-size').trim() || '19px';
    const curLine = getComputedStyle(root).getPropertyValue('--read-line').trim() || '1.85';
    const curPx   = getComputedStyle(root).getPropertyValue('--read-px').trim()   || '24px';

    this._syncTypoButtons('size',    curSize);
    this._syncTypoButtons('line',    curLine);
    this._syncTypoButtons('padding', curPx);

    // 同步滑块
    const sizeSlider = document.querySelector('.typo-slider[oninput*="size"]');
    if (sizeSlider) sizeSlider.value = parseFloat(curSize);
    this.syncSliderLabel('size-val', curSize);

    const lineSlider = document.querySelector('.typo-slider[oninput*="line"]');
    if (lineSlider) lineSlider.value = parseFloat(curLine);
    this.syncSliderLabel('line-val', curLine);

    const padSlider = document.querySelector('.typo-slider[oninput*="padding"]');
    if (padSlider) padSlider.value = parseFloat(curPx);
    this.syncSliderLabel('padding-val', curPx);

    // 同步阅读模式按钮
    document.querySelectorAll('.typo-btn[data-param="mode"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'paginated') === this._paginationMode);
    });

    // 同步单/双页按钮
    document.querySelectorAll('.typo-btn[data-param="columns"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'dual') === this._dualPage);
    });

    // 控制「版式」行的可见性（仅分页模式下显示）
    const colGroup = document.getElementById('typo-columns-group');
    if (colGroup) colGroup.style.display = this._paginationMode ? '' : 'none';

    // 渲染字体/配色 chip
    this.renderTypoFontChips();
    this.renderTypoColorChips();

    document.getElementById('typography-panel').classList.add('active');
    document.getElementById('typography-backdrop').classList.add('active');
  },

  closeTypography() {
    document.getElementById('typography-panel').classList.remove('active');
    document.getElementById('typography-backdrop').classList.remove('active');
  },

  // 「更多设置」跳转（已无需跳转，保留兼容）
  goToTypographySettings() {
    this.closeTypography();
    this.close();
    App.switchTab('settings');
    Settings.switchTab('appearance');
  },

  // 同步滑块标签显示值
  syncSliderLabel(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  // 渲染「字」面板中的字体 chip（从新 fontSettings 读取）
  renderTypoFontChips() {
    const container = document.getElementById('typo-font-chips');
    if (!container) return;
    const allFonts = [...FONT_PRESETS, ...(fontSettings.customFonts || [])];
    const currentBody = fontSettings.slotBody || 'default';
    container.innerHTML = allFonts.map(f => `
      <div class="typo-font-chip${f.id === currentBody ? ' active' : ''}"
        onclick="Reader.applyReadFont('${f.id}')">
        ${App.escapeHtml(f.label)}
      </div>
    `).join('');
  },

  // 应用阅读字体（更新 slotBody，同步三槽系统）
  applyReadFont(fontId) {
    const allFonts = [...FONT_PRESETS, ...(fontSettings.customFonts || [])];
    const f = allFonts.find(x => x.id === fontId);
    if (!f) return;
    if (f.url) loadFontUrl(f.url);
    fontSettings.slotBody = fontId === 'default' ? null : fontId;
    fontSettings.activeSchemeId = null;
    saveFontSettings();
    applyFontSettings();
    this.renderTypoFontChips();
    // 同步设置页 UI（若已渲染）
    if (typeof Settings !== 'undefined') Settings.renderFontSettings();
    App.showToast(`阅读字体已设为「${f.label}」`);
  },

  // 渲染「字」面板中的配色 chip（内置 + 用户自定义）
  renderTypoColorChips() {
    const userContainer = document.getElementById('typo-user-color-chips');
    if (!userContainer) return;
    const schemes = JSON.parse(localStorage.getItem('color-schemes') || '[]');
    userContainer.innerHTML = schemes.map((s, i) => `
      <div class="typo-color-chip" style="background:${s.bg};"
        title="${App.escapeHtml(s.name)}"
        onclick="Reader.setReadColor('${s.bg}','${s.ink}',this)"></div>
    `).join('');
  },

  // 设置阅读区专属配色（--read-bg / --read-ink，不影响全局）
  setReadColor(bg, ink, el) {
    const content = document.getElementById('reader-content');
    if (content) {
      content.style.setProperty('--read-bg',  bg);
      content.style.setProperty('--read-ink', ink);
      content.style.background = `var(--read-bg, ${bg})`;
      content.style.color      = `var(--read-ink, ${ink})`;
    }
    // 更新 chip 激活状态
    document.querySelectorAll('.typo-color-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    // 持久化
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.readBg = bg;
    saved.readInk = ink;
    localStorage.setItem('read-layout', JSON.stringify(saved));
  },

  // 排版参数切换（供 HTML 按钮调用）
  setTypoParam(param, value, btn) {
    const varMap = {
      size:    '--read-size',
      line:    '--read-line',
      padding: '--read-px'
    };
    const cssVar = varMap[param];
    if (!cssVar) return;

    document.documentElement.style.setProperty(cssVar, value);

    // btn 可能为 null（滑块直接调用时传 null），只在有 btn 时更新激活状态
    if (btn) {
      const optionsContainer = btn.closest('.typo-options');
      if (optionsContainer) {
        optionsContainer.querySelectorAll('.typo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }

    // 同步同组的档位按钮激活状态（滑块拖动时也同步）
    document.querySelectorAll(`.typo-btn[data-param="${param}"]`).forEach(b => {
      b.classList.toggle('active', b.dataset.value === value);
    });

    // 持久化（与设置页共享同一 key）
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved[param] = value;
    localStorage.setItem('read-layout', JSON.stringify(saved));
  },

  // 同步按钮激活状态
  _syncTypoButtons(param, currentValue) {
    document.querySelectorAll(`.typo-btn[data-param="${param}"]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === currentValue);
    });
  },

  // 从 localStorage 恢复排版设置（open() 时调用）
  restoreTypography() {
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    const root = document.documentElement;
    if (saved.size)    root.style.setProperty('--read-size', saved.size);
    if (saved.line)    root.style.setProperty('--read-line', saved.line);
    if (saved.padding) root.style.setProperty('--read-px',   saved.padding);
    // 恢复阅读专属配色
    const rc = document.getElementById('reader-content');
    if (rc) {
      if (saved.readBg)  rc.style.setProperty('--read-bg',  saved.readBg);
      if (saved.readInk) rc.style.setProperty('--read-ink', saved.readInk);
    }
    // 恢复阅读模式
    this._paginationMode = saved.paginationMode || false;
    this._dualPage = saved.dualPage || false;
  },

  // ═══ 分页引擎 ═══

  _dualPage: false,       // 单页/双页模式
  _paginationMode: false, // 是否分页模式
  _currentPage: 0,
  _totalPages: 1,
  _pageWidth: 0,          // 每次翻页的 translateX 步长

  // 切换分页/滚动模式
  togglePaginationMode(mode) {
    this._paginationMode = mode;
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.paginationMode = mode;
    localStorage.setItem('read-layout', JSON.stringify(saved));

    if (mode) {
      this.enablePagination();
    } else {
      this.disablePagination();
    }
    // 同步按钮状态
    document.querySelectorAll('.typo-btn[data-param="mode"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'paginated') === mode);
    });
    // 显示/隐藏版式选项
    const colGroup = document.getElementById('typo-columns-group');
    if (colGroup) colGroup.style.display = mode ? '' : 'none';
  },

  // 切换单页/双页
  togglePageColumns(dual) {
    this._dualPage = dual;
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.dualPage = dual;
    localStorage.setItem('read-layout', JSON.stringify(saved));

    const container = document.getElementById('reader-content');
    container.classList.toggle('dual-page', dual);

    // 同步按钮状态
    document.querySelectorAll('.typo-btn[data-param="columns"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'dual') === dual);
    });

    // 如果当前是分页模式，重算
    if (this._paginationMode) {
      this.recalcPages();
    }
  },

  // 启用分页模式
  enablePagination() {
    const container = document.getElementById('reader-content');
    container.classList.add('paginated');

    // 将现有内容包裹在 page-columns 容器中
    if (!container.querySelector('.page-columns')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'page-columns';
      while (container.firstChild) {
        wrapper.appendChild(container.firstChild);
      }
      container.appendChild(wrapper);
    }

    // 移除滚动监听
    if (this._scrollHandler) {
      container.removeEventListener('scroll', this._scrollHandler);
    }

    // 应用双页类
    if (this._dualPage) container.classList.add('dual-page');

    // 计算分页（延迟等待 DOM 稳定）
    setTimeout(() => this.recalcPages(), 80);

    // 显示页码指示器
    const indicator = document.getElementById('page-indicator');
    if (indicator) indicator.classList.add('active');

    // 添加翻页触摸区
    this._setupTapZones();
    this._setupSwipeGesture();
    this._setupKeyboardNav();
  },

  // 禁用分页模式（恢复滚动）
  disablePagination() {
    const container = document.getElementById('reader-content');
    container.classList.remove('paginated');
    container.classList.remove('dual-page');

    // 解包 page-columns
    const wrapper = container.querySelector('.page-columns');
    if (wrapper) {
      wrapper.style.transform = '';
      wrapper.style.columnWidth = '';
      wrapper.style.columnGap = '';
      wrapper.style.height = '';
      while (wrapper.firstChild) {
        container.appendChild(wrapper.firstChild);
      }
      wrapper.remove();
    }

    // 隐藏页码指示器
    const indicator = document.getElementById('page-indicator');
    if (indicator) indicator.classList.remove('active');

    // 移除翻页触摸区
    this._removeTapZones();
    this._removeSwipeGesture();
    this._removeKeyboardNav();

    // 重新绑定滚动监听
    this._scrollHandler = () => this.updateProgress();
    container.addEventListener('scroll', this._scrollHandler, { passive: true });
  },

  // 计算总页数（核心：正确处理 padding、单/双页）
  recalcPages() {
    const container = document.getElementById('reader-content');
    const wrapper = container.querySelector('.page-columns');
    if (!wrapper) return;

    // 获取 padding 值
    const cs = getComputedStyle(container);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;

    // 内容区可用尺寸（扣除 padding）
    const contentW = container.clientWidth - padL - padR;
    const contentH = container.clientHeight - padT - padB - 44; // 44px 为底部页码栏高度

    if (this._dualPage) {
      // 双页：2 列可见，每列 = (contentW - gap) / 2
      const gap = 32;
      const colW = Math.floor((contentW - gap) / 2);
      wrapper.style.columnCount = '2';
      wrapper.style.columnWidth = colW + 'px';
      wrapper.style.columnGap = gap + 'px';
      // 翻页步长：跳过 2 列 = 2 * (colW + gap)
      this._pageWidth = 2 * (colW + gap);
    } else {
      // 单页：1 列 = 整个 contentW，无间距
      wrapper.style.columnCount = '1';
      wrapper.style.columnWidth = Math.round(contentW) + 'px';
      wrapper.style.columnGap = '0px';
      // 翻页步长 = contentW
      this._pageWidth = Math.round(contentW);
    }

    wrapper.style.height = contentH + 'px';

    // 等待浏览器重排后再测量 scrollWidth
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sw = wrapper.scrollWidth;
        this._totalPages = Math.max(1, Math.ceil(sw / this._pageWidth));

        if (this._currentPage >= this._totalPages) {
          this._currentPage = this._totalPages - 1;
        }
        this.goToPage(this._currentPage);
      });
    });
  },

  // 翻到指定页
  goToPage(page) {
    page = Math.max(0, Math.min(page, this._totalPages - 1));
    this._currentPage = page;

    const wrapper = document.querySelector('.page-columns');
    if (wrapper) {
      wrapper.style.transform = `translateX(-${page * this._pageWidth}px)`;
    }

    this._updatePageIndicator();
    this.updateProgress();
  },

  // 上一页
  prevPage() {
    if (this._currentPage > 0) {
      this.goToPage(this._currentPage - 1);
    }
  },

  // 下一页
  nextPage() {
    if (this._currentPage < this._totalPages - 1) {
      this.goToPage(this._currentPage + 1);
    }
  },

  // 更新页码显示
  _updatePageIndicator() {
    const numEl = document.getElementById('page-num');
    if (numEl) {
      numEl.textContent = `${this._currentPage + 1} / ${this._totalPages}`;
    }
    // 更新按钮禁用状态
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    if (prevBtn) prevBtn.disabled = this._currentPage <= 0;
    if (nextBtn) nextBtn.disabled = this._currentPage >= this._totalPages - 1;
  },

  // ─── 翻页触摸区 ───
  _setupTapZones() {
    this._removeTapZones();
    const container = document.getElementById('reader-content');
    const leftZone = document.createElement('div');
    leftZone.className = 'page-tap-zone page-tap-left';
    leftZone.id = 'tap-zone-left';
    leftZone.addEventListener('click', () => this.prevPage());

    const rightZone = document.createElement('div');
    rightZone.className = 'page-tap-zone page-tap-right';
    rightZone.id = 'tap-zone-right';
    rightZone.addEventListener('click', () => this.nextPage());

    container.parentElement.appendChild(leftZone);
    container.parentElement.appendChild(rightZone);
  },

  _removeTapZones() {
    document.getElementById('tap-zone-left')?.remove();
    document.getElementById('tap-zone-right')?.remove();
  },

  // ─── 滑动翻页手势 ───
  _setupSwipeGesture() {
    this._removeSwipeGesture();
    const container = document.getElementById('reader-content');
    let startX = 0, startY = 0, isDragging = false;

    this._touchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    };
    this._touchEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      // 水平滑动幅度 > 50px 且大于垂直幅度
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) this.nextPage();
        else this.prevPage();
      }
    };

    container.addEventListener('touchstart', this._touchStart, { passive: true });
    container.addEventListener('touchend', this._touchEnd, { passive: true });
  },

  _removeSwipeGesture() {
    const container = document.getElementById('reader-content');
    if (this._touchStart) container.removeEventListener('touchstart', this._touchStart);
    if (this._touchEnd) container.removeEventListener('touchend', this._touchEnd);
    this._touchStart = null;
    this._touchEnd = null;
  },

  // ─── 键盘翻页 ───
  _setupKeyboardNav() {
    this._removeKeyboardNav();
    this._keyHandler = (e) => {
      if (!this._paginationMode) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        this.nextPage();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  _removeKeyboardNav() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
};

// 监听文本选择
document.addEventListener('selectionchange', () => {
  if (document.getElementById('reader-overlay').classList.contains('active')) {
    // 短暂延迟确保选择完成
    clearTimeout(Reader._selectionTimer);
    Reader._selectionTimer = setTimeout(() => Reader.handleSelection(), 200);
  }
});

// 窗口 resize 时重算分页
window.addEventListener('resize', () => {
  if (Reader._paginationMode && document.getElementById('reader-overlay').classList.contains('active')) {
    clearTimeout(Reader._resizeTimer);
    Reader._resizeTimer = setTimeout(() => Reader.recalcPages(), 200);
  }
});

// chat-input 自动高度 + Enter 发送
document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        Reader.sendChatMessage();
      }
    });
  }
});
