/* ═══════════════════════════════════════
   NOTES.JS - 笔记本逻辑
   ═══════════════════════════════════════ */

const Notes = {
  freeNoteUnsaved: false,

  // ─── 渲染笔记列表 ───
  async render() {
    const notes = await Store.getAll('notes');
    const books = await Store.getAll('books');
    
    const container = document.getElementById('notes-list');
    container.innerHTML = '';

    if (notes.length === 0) {
      container.innerHTML = '<div class="notes-empty">还没有笔记<br>在阅读时选中文字可创建笔记</div>';
      return;
    }

    // 按书籍分组
    const bookMap = {};
    books.forEach(b => { bookMap[b.id] = b; });

    const grouped = {};
    notes.forEach(note => {
      const key = note.bookId || 'free';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(note);
    });

    // 渲染每个分组（按最近更新的书排序）
    const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
      const latestA = Math.max(...grouped[a].map(n => n.updatedAt || 0));
      const latestB = Math.max(...grouped[b].map(n => n.updatedAt || 0));
      return latestB - latestA;
    });

    sortedGroupKeys.forEach(bookId => {
      const bookNotes = grouped[bookId];
      const book = bookMap[parseInt(bookId)];
      const bookTitle = book ? book.title : '未知书籍';

      const groupDiv = document.createElement('div');
      groupDiv.className = 'note-group';
      groupDiv.innerHTML = `
        <div class="note-group-header" onclick="Notes.toggleGroup(this.parentElement)">
          <div class="note-group-left">
            <span class="note-group-title">${this.escapeHtml(bookTitle)}</span>
            <span class="note-group-count">${bookNotes.length} 条</span>
          </div>
          <span class="note-group-arrow">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="2 4 6 8 10 4"/>
            </svg>
          </span>
        </div>
        <div class="note-list"></div>
      `;

      const listDiv = groupDiv.querySelector('.note-list');
      
      // 按时间倒序
      bookNotes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      
      bookNotes.forEach(note => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'note-item';
        noteDiv.onclick = () => this.openNote(note.id);
        
        // 笔记类型标记
        const typeLabel = note.type === 'ai' ? 'ai' : note.type === 'note' ? 'note' : 'quote';
        
        // 最后一条消息预览
        const lastMsg = note.messages && note.messages.length > 0
          ? note.messages[note.messages.length - 1].content
          : '';
        
        noteDiv.innerHTML = `
          <div class="note-quote">${this.escapeHtml(note.quote || '').substring(0, 120)}</div>
          ${lastMsg ? `<div class="note-preview">${this.escapeHtml(lastMsg).substring(0, 80)}</div>` : ''}
          <div class="note-meta">
            <span class="note-type">${typeLabel}</span>
            <span class="note-time">${this.formatTime(note.updatedAt)}</span>
          </div>
        `;
        
        listDiv.appendChild(noteDiv);
      });

      container.appendChild(groupDiv);
    });
  },

  // ─── 切换分组折叠 ───
  toggleGroup(groupEl) {
    groupEl.classList.toggle('collapsed');
  },

  // ─── 打开笔记（跳转到对应书籍和AI聊天） ───
  async openNote(noteId) {
    const note = await Store.get('notes', noteId);
    if (!note) return;

    // note.bookId 是 IndexedDB autoIncrement 生成的数字，直接传给 Store.get 即可
    const book = await Store.get('books', note.bookId);
    if (!book) {
      App.showToast('找不到对应书籍');
      return;
    }

    App.switchTab('shelf');
    await Reader.open(note.bookId);
    // 稍作延迟等待阅读器内容渲染完成后再打开侧边栏
    setTimeout(() => Reader.openAIChat(noteId), 400);
  },

  // ─── 删除笔记 ───
  async deleteNote(noteId) {
    if (!confirm('删除这条笔记？')) return;
    await Store.delete('notes', noteId);
    App.showToast('已删除');
    await this.render();
  },

  // ─── 显示自由笔记编辑器（全屏覆盖） ───
  showFreeNoteEditor() {
    const editor = document.getElementById('free-note-editor');
    editor.classList.add('active');
    
    // 加载已保存内容
    const saved = localStorage.getItem('free-note') || '';
    const textarea = document.getElementById('free-note-textarea');
    textarea.value = saved;
    this.updateCharCount();
    
    // 聚焦到末尾
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 100);
  },

  // ─── 关闭自由笔记编辑器 ───
  closeFreeNoteEditor() {
    if (this.freeNoteUnsaved) {
      // 自动保存
      this.saveFreeNote(true);
    }
    document.getElementById('free-note-editor').classList.remove('active');
    this.freeNoteUnsaved = false;
  },

  // ─── 保存自由笔记 ───
  saveFreeNote(silent = false) {
    const textarea = document.getElementById('free-note-textarea');
    const content = textarea.value;
    localStorage.setItem('free-note', content);
    this.freeNoteUnsaved = false;
    if (!silent) App.showToast('已保存');
  },

  // ─── 更新字数统计 ───
  updateCharCount() {
    const textarea = document.getElementById('free-note-textarea');
    const count = textarea.value.length;
    const el = document.getElementById('free-note-count');
    if (el) el.textContent = count > 0 ? `${count} 字` : '';
  },

  // ─── 工具函数 ───
  // 代理 App.escapeHtml，避免重复实现（App 始终先于 Notes 加载）
  escapeHtml(text) {
    return App.escapeHtml(text);
  },

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000)    return '刚刚';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');
    
    if (year === now.getFullYear()) return `${month}-${day}`;
    return `${year}-${month}-${day}`;
  }
};

// 监听自由笔记输入
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('free-note-textarea');
  if (textarea) {
    textarea.addEventListener('input', () => {
      Notes.freeNoteUnsaved = true;
      Notes.updateCharCount();
    });
    // Ctrl/Cmd + S 快速保存
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        Notes.saveFreeNote();
      }
    });
  }
});
