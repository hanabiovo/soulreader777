/* ═══════════════════════════════════════
   APP.JS - 入口、tab 切换、全局初始化
   ═══════════════════════════════════════ */

const App = {
  currentTab: 'shelf',
  books: [],
  shelfView: 'grid', // 'grid' | 'list'
  shelfSort: 'recent', // 'recent' | 'time' | 'name'
  _debugMode: false,
  _logBuffer: [],
  _LOG_MAX: 50,

  // ─── 统一调试日志 ───
  log(level, module, message, error) {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = { ts, level, module, message, error: error || null };

    // 始终输出到 console
    const tag = `[${module}]`;
    if (level === 'error') {
      console.error(tag, message, error || '');
    } else if (level === 'warn') {
      console.warn(tag, message, error || '');
    } else {
      console.log(tag, message);
    }

    // 写入缓冲
    this._logBuffer.push(entry);
    if (this._logBuffer.length > this._LOG_MAX) {
      this._logBuffer.shift();
    }

    // 若 debug 面板可见，追加 DOM
    if (this._debugMode) {
      this._appendLogDOM(entry);
    }
  },

  // 初始化调试面板（URL 含 ?debug=1 时启用）
  _initDebugPanel() {
    if (!new URLSearchParams(location.search).has('debug')) return;
    this._debugMode = true;

    const panel = document.getElementById('debug-panel');
    if (panel) {
      panel.classList.add('active');
      // 回放缓冲
      this._logBuffer.forEach(e => this._appendLogDOM(e));
    }
  },

  _appendLogDOM(entry) {
    const list = document.getElementById('debug-log-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = `debug-entry debug-${entry.level}`;
    const errStr = entry.error ? `\n${entry.error.stack || entry.error.message || entry.error}` : '';
    div.textContent = `${entry.ts} [${entry.level.toUpperCase()}] ${entry.module}: ${entry.message}${errStr}`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    // 超出上限移除最早的 DOM
    while (list.children.length > this._LOG_MAX) {
      list.removeChild(list.firstChild);
    }
  },

  clearDebugLog() {
    this._logBuffer = [];
    const list = document.getElementById('debug-log-list');
    if (list) list.innerHTML = '';
  },

  toggleDebugPanel() {
    const panel = document.getElementById('debug-panel');
    if (panel) panel.classList.toggle('minimized');
  },

  // 初始化应用
  async init() {
    console.log('SoulReader · 灵犀 启动中...');
    
    // 恢复持久化状态（必须在 loadShelf 之前）
    this.shelfView = localStorage.getItem('shelf-view') || 'grid';
    this.shelfSort = localStorage.getItem('shelf-sort') || 'recent';
    
    // 初始化数据库
    await Store.init();
    
    // 初始化各模块
    AI.init();
    Settings.init();
    
    // 加载书架
    await this.loadShelf();
    
    // 绑定事件
    this.bindEvents();
    
    // 显示默认 tab
    this.switchTab('shelf');

    // 初始化调试面板
    this._initDebugPanel();

    this.log('info', 'App', '应用初始化完成');
  },

  // 加载书架
  async loadShelf() {
    this.books = await Store.getAll('books');
    this.renderShelf();
  },

  // 渲染书架
  renderShelf() {
    const container = document.getElementById('shelf-list');
    const emptyTip = document.getElementById('empty-shelf');
    
    if (this.books.length === 0) {
      container.style.display = 'none';
      emptyTip.style.display = 'block';
      return;
    }
    
    container.style.display = '';
    emptyTip.style.display = 'none';
    
    // 排序
    this.sortBooks();
    
    // 切换视图类
    container.className = this.shelfView === 'grid' ? 'grid-view' : 'list-view';
    
    // 更新视图切换按钮状态
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.shelfView);
    });
    
    // 渲染
    if (this.shelfView === 'grid') {
      this.renderGridView(container);
    } else {
      this.renderListView(container);
    }
  },

  // 排序书籍
  sortBooks() {
    switch (this.shelfSort) {
      case 'recent':
        this.books.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
        break;
      case 'time':
        this.books.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case 'name':
        this.books.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        break;
    }
  },

  // 网格视图
  renderGridView(container) {
    container.innerHTML = this.books.map(book => {
      const color = book.color || this.randomColor();
      // book.id 由 autoIncrement 生成为数字，需保证传参一致
      return `
        <div class="book-cover" style="background: ${color}" onclick="App.openBook(${book.id})">
          <div class="book-cover-title">${this.escapeHtml(book.title)}</div>
        </div>
      `;
    }).join('');
  },

  // 列表视图
  renderListView(container) {
    container.innerHTML = this.books.map(book => {
      // content 可能不存在（PDF 模式），兼容处理
      const contentLen = (book.content || '').length;
      const progress = book.scrollPosition && contentLen
        ? Math.round((book.scrollPosition / contentLen) * 100)
        : 0;
      const charCount = contentLen ? this.formatCharCount(contentLen) : '–';
      // format 字段：兼容旧字段名 type
      const fmt = (book.format || book.type || '?').toUpperCase();
      const meta = `${fmt} · ${charCount} · ${this.formatTime(book.lastOpenedAt)}`;
      
      return `
        <div class="book-item-list" onclick="App.openBook(${book.id})">
          <div class="book-info">
            <div class="book-title">${this.escapeHtml(book.title)}</div>
            <div class="book-meta">${meta}</div>
          </div>
          <div class="book-actions">
            <span class="book-progress">${progress}%</span>
            <span class="book-delete" onclick="event.stopPropagation(); App.deleteBook(${book.id})">删</span>
          </div>
        </div>
      `;
    }).join('');
  },

  // 打开书籍
  async openBook(bookId) {
    const book = await Store.get('books', bookId);
    if (!book) return;
    
    // 更新最近打开时间
    book.lastOpenedAt = Date.now();
    await Store.put('books', book);
    
    // 打开阅读器
    await Reader.open(bookId);
  },

  // 删除书籍
  async deleteBook(bookId) {
    if (!confirm('确定删除这本书吗？相关笔记也会被删除。')) return;
    
    // 删除书籍
    await Store.delete('books', bookId);
    
    // 删除相关笔记
    const notes = await Store.getAll('notes');
    for (const note of notes) {
      if (note.bookId === bookId) {
        await Store.delete('notes', note.id);
      }
    }
    
    this.showToast('已删除');
    await this.loadShelf();
  },

  // 导入文件
  async importFile(file) {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const isPdf = ext === 'pdf';

      if (isPdf) {
        this.showToast('PDF 渲染中，请稍候…');
      } else {
        this.showToast('正在解析...');
      }

      // PDF 传入进度回调
      const onProgress = isPdf ? (cur, total) => {
        this.showToast(`PDF 渲染中 ${cur}/${total} 页…`);
      } : undefined;

      const bookData = isPdf
        ? await Parser.parsePDF(file, onProgress)
        : await Parser.parse(file);
      
      const book = {
        // 注意：不预设 id，让 IndexedDB autoIncrement 生成
        title: bookData.title,
        content: bookData.content || '',   // PDF 无 content，epub/txt 正常
        htmlContent: bookData.htmlContent || '',  // EPUB 富文本
        format: bookData.format,           // 统一使用 format 字段
        type: bookData.format,             // 兼容旧字段名 type
        size: bookData.size,
        color: this.randomColor(),
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        scrollPosition: 0,
        currentPage: 0,                    // PDF 页码记忆
        context: '',
        memories: []
      };

      // PDF 特有字段
      if (isPdf && bookData.pdfPages) {
        book.pdfPages = bookData.pdfPages;   // dataURL 数组（canvas 渲染结果）
        book.pdfData = bookData.pdfData;     // 原始 ArrayBuffer（AI 按需提取文字用）
      }
      
      await Store.put('books', book);
      
      this.showToast('导入成功');
      await this.loadShelf();
    } catch (error) {
      this.log('error', 'App', '导入失败: ' + error.message, error);
      this.showToast('导入失败: ' + error.message);
    }
  },

  // 切换 Tab
  switchTab(tabName) {
    this.currentTab = tabName;
    
    // 更新导航栏
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // 更新视图
    document.querySelectorAll('.view-page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(`view-${tabName}`).classList.add('active');
    
    // 特殊处理
    if (tabName === 'notes') {
      Notes.render();
    } else if (tabName === 'settings') {
      // 设置页是全屏 view-page，切换时初始化第一个 tab
      Settings.switchTab('ai');
    }
  },

  // 切换书架视图（直接设置）
  setShelfView(view) {
    if (this.shelfView === view) return;
    this.shelfView = view;
    localStorage.setItem('shelf-view', this.shelfView);
    this.renderShelf();
  },

  // 兼容旧代码
  toggleShelfView() {
    this.setShelfView(this.shelfView === 'grid' ? 'list' : 'grid');
  },

  // 切换排序
  changeSort(sortType) {
    this.shelfSort = sortType;
    localStorage.setItem('shelf-sort', this.shelfSort);
    
    // 更新按钮状态
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-sort="${sortType}"]`).classList.add('active');
    
    this.renderShelf();
  },

  // 绑定事件
  bindEvents() {
    // 文件导入
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.importFile(file);
          e.target.value = ''; // 清空，允许重复导入同一文件
        }
      });
    }

    // AI 侧边栏遮罩点击关闭（由 HTML onclick 处理，这里做备用）
    document.getElementById('ai-sidebar-backdrop')?.addEventListener('click', () => {
      Reader.closeAIChat();
    });

    // 初始化排序按钮状态（shelfSort 已在 init() 中从 localStorage 读取）
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === this.shelfSort);
    });
  },

  // 工具函数
  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  },

  randomColor() {
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
      '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  formatCharCount(count) {
    if (count < 1000) return count + ' 字';
    if (count < 10000) return (count / 1000).toFixed(1) + ' k字';
    return Math.round(count / 10000) + ' 万字';
  },

  formatTime(timestamp) {
    if (!timestamp) return '未打开';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)} 天前`;
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }
};

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
