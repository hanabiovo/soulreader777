/* ═══════════════════════════════════════
   APP.JS - 入口、tab 切换、全局初始化
   ═══════════════════════════════════════ */

const APP_VERSION = '0.3.6-beta';

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

    // 显示版本号
    const verEl = document.getElementById('app-version-label');
    if (verEl && typeof APP_VERSION !== 'undefined') verEl.textContent = APP_VERSION;

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
      // 使用 data-id 属性而非内联 onclick 注入 id，防止 id 被污染时的 XSS 风险
      return `
        <div class="book-cover" data-book-id="${parseInt(book.id) || 0}">
          ${this._getCoverInnerHTML(book)}
        </div>
      `;
    }).join('');
    // 事件委托：统一在容器上监听点击
    container.querySelectorAll('.book-cover').forEach(el => {
      el.addEventListener('click', (e) => {
        // 点击删除按钮时不打开书籍（兼容图片封面：用 closest 向上查找）
        if (e.target.closest('[data-del-id]')) return;
        const id = parseInt(el.dataset.bookId);
        if (id) App.openBook(id);
      });
    });
    // 删除按钮事件委托（网格视图）
    container.querySelectorAll('[data-del-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.delId);
        if (id) App.deleteBook(id);
      });
    });
  },

  // 按当前封面风格生成独立 DOM（switch 模式，避免节点互相干扰）
  _getCoverInnerHTML(b) {
    const style = localStorage.getItem('sr_cover_style') || 'c';

    // 进度计算：优先用 scrollRatio（0~1），关闭阅读器时由 reader.js 写入
    // 旧数据无此字段时回退为 0
    const pct = b.scrollRatio != null
      ? Math.min(100, Math.round(b.scrollRatio * 100))
      : 0;

    // 作者：优先用 b.author 字段；其次从书名解析 "书名 - 作者" 格式
    let rawTitle = (b.title || '').replace(/\.(txt|pdf|epub)$/i, '');
    let rawAuthor = b.author || '';
    if (!rawAuthor) {
      const m = rawTitle.match(/^(.+?)\s*[-—]\s*(.+)$/);
      if (m) { rawTitle = m[1].trim(); rawAuthor = m[2].trim(); }
    }
    const title  = this.escapeHtml(rawTitle);
    const author = this.escapeHtml(rawAuthor);
    // data-del-id 由外层事件委托处理，不直接注入 id 到 onclick
    const delBtn = `<div class="book-del-btn" data-del-id="${parseInt(b.id) || 0}">×</div>`;

    // ── 有原书封面图时，且用户开启了"显示原书封面"，统一显示图片封面 ──
    const showCoverImage = localStorage.getItem('sr_show_cover_image') !== 'false';
    if (b.coverImage && showCoverImage) {
      const pctBar = pct > 0
        ? `<div class="cover-img-progress"><div class="cover-img-progress-fill" style="width:${pct}%"></div></div>`
        : '';
      return `
        <img class="cover-img" src="${b.coverImage}" alt="${title}" draggable="false">
        <div class="cover-img-overlay">
          ${pctBar}
        </div>
        ${delBtn}
      `;
    }

    switch (style) {
      case 'a':
        return `
          <div class="cover-title">${title}</div>
          <div class="cover-author">${author}</div>
          <div class="cover-progress">
            <div class="cover-progress-fill" style="width:${pct}%"></div>
          </div>
          ${delBtn}
        `;

      case 'b':
        return `
          <div class="cover-top">
            <div class="cover-title">${title}</div>
            <div class="cover-author">${author}</div>
          </div>
          <div class="cover-footer">
            <span class="cover-pct">${pct > 0 ? pct + '%' : ''}</span>
          </div>
          ${delBtn}
        `;

      case 'c':
      default:
        return `
          <div class="cover-body">
            <div class="cover-title">${title}</div>
          </div>
          <div class="cover-footer">
            <span class="cover-author">${author}</span>
            <div class="cover-bar">
              <div class="cover-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>
          ${delBtn}
        `;
    }
  },

  // 列表视图
  renderListView(container) {
    container.innerHTML = this.books.map(book => {
      // 进度：统一使用 scrollRatio（0~1），与网格视图数据源一致
      // scrollRatio 由 reader.js close() 写入，覆盖滚动/分页/PDF 三种模式
      const progress = book.scrollRatio != null
        ? Math.min(100, Math.round(book.scrollRatio * 100))
        : 0;
      const contentLen = (book.content || '').length;
      const charCount = contentLen ? this.formatCharCount(contentLen) : '–';
      // format 字段：兼容旧字段名 type
      const fmt = (book.format || book.type || '?').toUpperCase();
      const meta = `${fmt} · ${charCount} · ${this.formatTime(book.lastOpenedAt)}`;
      const safeId = parseInt(book.id) || 0;
      
      return `
        <div class="book-item-list" data-book-id="${safeId}">
          <div class="book-info">
            <div class="book-title">${this.escapeHtml(book.title)}</div>
            <div class="book-meta">${meta}</div>
          </div>
          <div class="book-actions">
            <span class="book-progress">${progress}%</span>
            <span class="book-delete" data-del-id="${safeId}">删</span>
          </div>
        </div>
      `;
    }).join('');
    // 事件委托：统一在容器上监听点击
    container.querySelectorAll('.book-item-list').forEach(el => {
      el.addEventListener('click', (e) => {
        // 点击删除按钮时不打开书籍
        if (e.target.closest('[data-del-id]')) return;
        const id = parseInt(el.dataset.bookId);
        if (id) App.openBook(id);
      });
    });
    container.querySelectorAll('[data-del-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.delId);
        if (id) App.deleteBook(id);
      });
    });
  },

  // 打开书籍
  async openBook(bookId) {
    this.showLoadingToast('正在打开…');
    try {
      const book = await Store.get('books', bookId);
      if (!book) { this.hideLoadingToast(); return; }
      
      // 更新最近打开时间
      book.lastOpenedAt = Date.now();
      await Store.put('books', book);
      
      // 打开阅读器（Reader.open 内部会接管 loading toast 的生命周期）
      await Reader.open(bookId);
    } catch (e) {
      this.hideLoadingToast();
      throw e;
    }
  },

  // 删除书籍
  async deleteBook(bookId) {
    if (!confirm('确定删除这本书吗？相关笔记也会被删除。')) return;
    
    // 删除书籍
    await Store.delete('books', bookId);
    
    // 批量删除相关笔记（收集所有待删 ID，减少 IndexedDB 事务次数）
    const notes = await Store.getAll('notes');
    const toDelete = notes.filter(n => n.bookId === bookId);
    await Promise.all(toDelete.map(n => Store.delete('notes', n.id)));
    
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

      // ── 重复导入检测 ──
      const existing = (this.books || []).find(
        b => b.title === bookData.title && b.size === bookData.size
      );
      if (existing) {
        // 弹出确认对话框，等待用户决定
        const confirmed = await this._confirmDupImport(bookData.title);
        if (!confirmed) return; // 用户取消，静默退出
      }

      const book = {
        // 若覆盖已有书籍，保留其 id（IndexedDB put 会覆盖同 id 记录）
        ...(existing ? { id: existing.id } : {}),
        title: bookData.title,
        author: bookData.author || '',     // EPUB 从 OPF <creator> 读取；TXT/PDF 留空
        content: bookData.content || '',   // PDF 无 content，epub/txt 正常
        htmlContent: bookData.htmlContent || '',  // EPUB 富文本
        imageMap: bookData.imageMap || null,      // EPUB 图片 { relPath: dataURL }，其他格式为 null
        coverImage: bookData.coverImage || null,  // 封面图 dataURL（EPUB/PDF 提取，TXT 为 null）
        format: bookData.format,           // 统一使用 format 字段（新写入）
        type: bookData.format,             // TODO: 兼容旧字段名 type，待旧数据迁移完成后可移除
        size: bookData.size,
        color: existing ? existing.color : this.randomColor(),
        createdAt: existing ? existing.createdAt : Date.now(),
        lastOpenedAt: Date.now(),
        scrollPosition: 0,
        scrollRatio: 0,                    // 阅读进度比值（0~1），关闭阅读器时更新
        currentPage: 0,                    // PDF 页码记忆
        context: existing ? (existing.context || '') : '',
        memories: existing ? (existing.memories || []) : []
      };

      // PDF 特有字段
      if (isPdf && bookData.pdfPages) {
        book.pdfPages = bookData.pdfPages;   // dataURL 数组（canvas 渲染结果）
        book.pdfData = bookData.pdfData;     // 原始 ArrayBuffer（AI 按需提取文字用）
      }
      
      await Store.put('books', book);
      
      this.showToast(existing ? '重新导入成功' : '导入成功');
      await this.loadShelf();
    } catch (error) {
      this.log('error', 'App', '导入失败: ' + error.message, error);
      this.showToast('导入失败: ' + error.message);
    }
  },

  // 显示重复导入确认对话框，返回 Promise<boolean>
  _confirmDupImport(title) {
    return new Promise(resolve => {
      const overlay = document.getElementById('dup-import-overlay');
      const msg = document.getElementById('dup-import-msg');
      if (!overlay || !msg) { resolve(true); return; }
      msg.textContent = `《${title}》已在书架中，重新导入将覆盖书籍内容，但会保留笔记与阅读进度。`;
      overlay.classList.add('open');
      this._dupImportResolve = resolve;
    });
  },

  _dupImportConfirm() {
    const overlay = document.getElementById('dup-import-overlay');
    if (overlay) overlay.classList.remove('open');
    if (this._dupImportResolve) { this._dupImportResolve(true); this._dupImportResolve = null; }
  },

  _dupImportCancel() {
    const overlay = document.getElementById('dup-import-overlay');
    if (overlay) overlay.classList.remove('open');
    if (this._dupImportResolve) { this._dupImportResolve(false); this._dupImportResolve = null; }
  },

  // 切换 Tab
  switchTab(tabName) {
    this.currentTab = tabName;
    
    // 更新导航栏
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    // 更新视图
    document.querySelectorAll('.view-page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(`view-${tabName}`)?.classList.add('active');
    
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
    document.querySelector(`[data-sort="${sortType}"]`)?.classList.add('active');
    
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

  // 持久 toast：显示后不自动消失，需手动调 hideLoadingToast() 关闭
  // 用于大文件加载、重排等耗时操作的进度提示
  showLoadingToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    // 清除可能存在的自动消失计时器（防止与 showToast 的定时器冲突）
    if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
  },

  hideLoadingToast() {
    const el = document.getElementById('toast');
    if (el) el.classList.remove('show');
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
