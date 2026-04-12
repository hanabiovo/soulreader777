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
  _dualPage: false,       // 单页/双页模式
  _currentPage: 0,
  _totalPages: 1,
  _pageWidth: 0,
  _forceIndent: false,    // 强制首行缩进
  // PDF canvas 模式状态
  _isPdf: false,
  _pdfCurrentPage: 0,
  _pdfTotalPages: 0,
  _pdfPageTextCache: '',
  _pdfDarkMode: 'auto', // 'light' | 'dark' | 'auto'
  _pdfDoc: null, // 缓存 pdfjsLib 文档对象，避免每次翻页重新解析

  // ─── 打开阅读器 ───
  async open(bookId) {
    const book = await Store.get('books', bookId);
    if (!book) return;

    this.currentBook = book;
    this._isPdf = (book.format === 'pdf' || book.type === 'pdf');
    
    // 恢复排版设置
    this.restoreTypography();
    
    // 显示阅读器
    document.getElementById('reader-overlay').classList.add('active');
    document.getElementById('reader-title').textContent = book.title;

    // ─── PDF canvas 模式 ───
    if (this._isPdf && book.pdfPages && book.pdfPages.length > 0) {
      this.renderPdfContent(book.pdfPages);
      // PDF 使用自带的分页，恢复页码
      this._pdfCurrentPage = book.currentPage || 0;
      this._pdfTotalPages = book.pdfPages.length;
      // 应用 PDF 反色设置
      this._applyPdfDarkMode();
      // 监听主题变化以同步"自动"模式
      this._themeObserver = new MutationObserver(() => {
        if (this._pdfDarkMode === 'auto') this._applyPdfDarkMode();
      });
      this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      // 判断是否使用分页模式（页码指示器由 _togglePdfPagination 控制）
      if (this._paginationMode) {
        this._togglePdfPagination(true);
      } else {
        this._showPdfPage(this._pdfCurrentPage);
        this._setupPdfScrollNav();
      }
      this._updatePdfPageIndicator();
      // 绑定键盘、滑动和滚轮翻页
      this._setupKeyboardNav();
      this._setupSwipeGesture();
      this._setupWheelNav();
      return;
    }
    
    // ─── EPUB / TXT 文本模式 ───
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
  async close() {
    // 保存阅读位置（await 确保进度写入 DB 后再刷新书架）
    if (this.currentBook) {
      if (this._isPdf) {
        // PDF 模式：保存当前页码 + 统一进度比值
        const page = this._pdfCurrentPage || 0;
        this.currentBook.currentPage = page;
        this.currentBook.scrollRatio = this._pdfTotalPages > 1
          ? Math.min(1, page / (this._pdfTotalPages - 1))
          : 0;
      } else if (this._paginationMode) {
        // 分页模式：保存当前页索引 + 统一进度比值
        this.currentBook.currentPage = this._currentPage;
        this.currentBook.scrollRatio = this._totalPages > 1
          ? Math.min(1, this._currentPage / (this._totalPages - 1))
          : 0;
      } else {
        const el = document.getElementById('reader-content');
        this.currentBook.scrollPosition = el.scrollTop;
        // 同时存 0~1 比值，供书架封面进度条使用
        const scrollable = el.scrollHeight - el.clientHeight;
        this.currentBook.scrollRatio = scrollable > 0
          ? Math.min(1, el.scrollTop / scrollable)
          : 0;
      }
      await Store.put('books', this.currentBook);
    }

    // 清理 PDF 模式
    if (this._isPdf) {
      this._removePdfScrollNav();
      this._removeKeyboardNav();
      this._removeSwipeGesture();
      this._removeTapZones();
      this._removeWheelNav();
      if (this._themeObserver) {
        this._themeObserver.disconnect();
        this._themeObserver = null;
      }
      const indicator = document.getElementById('page-indicator-inner');
      if (indicator) indicator.classList.remove('active');
      const container = document.getElementById('reader-content');
      container.classList.remove('pdf-content', 'pdf-inverted', 'pdf-paginated', 'pdf-dual-page');
      container.innerHTML = '';
    }

    // 清理分页模式（epub/txt）
    if (!this._isPdf && this._paginationMode) {
      this._removeTapZones();
      this._removeSwipeGesture();
      this._removeKeyboardNav();
      this._removeWheelNav();
      const indicator = document.getElementById('page-indicator-inner');
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

    // 移除锚点点击监听
    this._removeAnchorNav();

    // 移除滚动监听
    if (this._scrollHandler) {
      document.getElementById('reader-content').removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }

    // 统一清理键盘监听（幂等，多次调用无害，防止遗漏场景导致事件泄漏）
    this._removeKeyboardNav();

    // 关闭阅读器和所有子面板
    document.getElementById('reader-overlay').classList.remove('active');
    document.getElementById('selection-dock').classList.remove('active');
    this.closeAIChat();
    this.closeMemoryPanel();
    this.closeTypography();
    document.getElementById('toc-panel').classList.remove('active');
    document.getElementById('toc-backdrop').classList.remove('active');
    
    this.currentBook = null;
    this.currentNoteId = null;
    this._isPdf = false;
    this._pdfDoc = null;

    // 刷新书架，使进度条等数据与 DB 同步
    if (typeof App !== 'undefined') App.loadShelf();
  },

  // ─── 更新进度条 ───
  updateProgress() {
    // PDF 模式由 _updatePdfProgress 独立管理
    if (this._isPdf) return;
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
      // 填充图片 src（用 imageMap 替换 data-epub-src 占位）
      // 无论 imageMap 是否存在，都处理 img[data-epub-src]：
      // 有 imageMap → 尝试填充；无 imageMap（旧书）→ 全部隐藏，避免 broken image
      this._resolveEpubImages(this.currentBook ? this.currentBook.imageMap : null);
      // 绑定文内锚点跳转
      this._setupAnchorNav();
      return;
    }

    // TXT / 纯文本模式
    container.classList.add('txt-content');
    container.classList.remove('epub-content');
    const paragraphs = content.split(/\n+/).filter(p => p.trim());
    const html = paragraphs.map(p => {
      const trimmed = p.trim();
      // 识别标题（以 # 开头）：先切割原始文本再转义，避免转义后 slice 截断 HTML 实体
      if (trimmed.startsWith('### ')) return `<h3>${this.escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith('## '))  return `<h2>${this.escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('# '))   return `<h1>${this.escapeHtml(trimmed.slice(2))}</h1>`;
      const escaped = this.escapeHtml(trimmed);
      // 识别中文章节标题（复用 _tocPatterns）
      if (this._tocPatterns.some(re => re.test(trimmed))) {
        return `<h2 class="chapter-title">${escaped}</h2>`;
      }
      const isDialogue = /^["'"'「『【]/.test(trimmed);
      return `<p${isDialogue ? ' class="dialogue"' : ''}>${escaped}</p>`;
    }).join('');
    
    container.innerHTML = html;
  },

  // ─── 渲染 PDF（canvas 分页模式） ───
  renderPdfContent(pdfPages) {
    const container = document.getElementById('reader-content');
    container.classList.remove('epub-content', 'txt-content');
    container.classList.add('pdf-content');

    // 生成所有页面的 <img>，每页一张
    // .pdf-page-inner 包裹 img + text layer，确保 text layer 的 left:0 相对于 img 左边缘
    container.innerHTML = pdfPages.map((dataUrl, i) =>
      `<div class="pdf-page" data-page="${i}">` +
        `<div class="pdf-page-inner">` +
          `<img src="${dataUrl}" alt="第 ${i + 1} 页" draggable="false">` +
        `</div>` +
      `</div>`
    ).join('');
  },

  // ─── PDF：缓存文档对象 ───
  async _getPdfDoc() {
    if (this._pdfDoc) return this._pdfDoc;
    if (!this.currentBook?.pdfData) return null;
    this._pdfDoc = await pdfjsLib.getDocument({ data: this.currentBook.pdfData.slice(0) }).promise;
    return this._pdfDoc;
  },

  // ─── PDF：渲染 text layer（透明文字层，支持划词） ───
  async _renderPdfTextLayer(pageIndex) {
    if (!this.currentBook?.pdfData) return;

    const pageEl = document.querySelector(`.pdf-page[data-page="${pageIndex}"]`);
    if (!pageEl || pageEl.querySelector('.pdf-text-layer')) return; // 避免重复渲染

    // text layer 插入 .pdf-page-inner，使其 left:0 相对于 img 左边缘（而非 flex 容器）
    const innerEl = pageEl.querySelector('.pdf-page-inner') || pageEl;

    const pdf = await this._getPdfDoc();
    if (!pdf) return;
    const page = await pdf.getPage(pageIndex + 1); // pdfjs 页码从 1 开始
    const scale = this.currentBook.pdfScale || 2.0;
    const viewport = page.getViewport({ scale });

    // 创建 text layer 容器
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'pdf-text-layer';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.top = '0';
    textLayerDiv.style.left = '0';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    innerEl.appendChild(textLayerDiv);

    const textContent = await page.getTextContent();

    // pdfjs v3+ 要求在 container 上设置 --scale-factor CSS 变量
    textLayerDiv.style.setProperty('--scale-factor', scale);

    // 用 pdfjs 的 TextLayer 渲染器
    pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    });

    // 等 img 加载完成后计算缩放比，对齐 text layer 与可见图片
    // 使用 rAF 重试，避免 img.complete 时 clientWidth 仍为 0 的竞态问题
    const img = innerEl.querySelector('img');
    const tryApplyScale = () => {
      if (img.clientWidth) {
        const displayScale = img.clientWidth / viewport.width;
        textLayerDiv.style.transform = `scale(${displayScale})`;
        textLayerDiv.style.transformOrigin = '0 0';
      } else {
        requestAnimationFrame(tryApplyScale);
      }
    };
    if (img.complete) {
      requestAnimationFrame(tryApplyScale);
    } else {
      img.addEventListener('load', () => requestAnimationFrame(tryApplyScale), { once: true });
    }
  },

  // ─── PDF：显示指定页（滚动到对应位置 或 分页模式切换） ───
  _showPdfPage(pageIndex) {
    const container = document.getElementById('reader-content');
    const pages = container.querySelectorAll('.pdf-page');
    if (!pages[pageIndex]) return;

    if (this._paginationMode) {
      if (this._dualPage) {
        // 双页模式：对齐到偶数索引，同时显示两页
        if (pageIndex % 2 !== 0) pageIndex = Math.max(0, pageIndex - 1);
        pages.forEach((p, i) => {
          p.style.display = (i === pageIndex || i === pageIndex + 1) ? '' : 'none';
        });
        // 渲染当前可见页的 text layer
        this._renderPdfTextLayer(pageIndex);
        if (pageIndex + 1 < pages.length) this._renderPdfTextLayer(pageIndex + 1);
      } else {
        // 单页模式：隐藏所有页，只显示目标页
        pages.forEach((p, i) => {
          p.style.display = i === pageIndex ? '' : 'none';
        });
        // 渲染当前页的 text layer
        this._renderPdfTextLayer(pageIndex);
      }
    } else {
      // 滚动模式：滚到目标页
      pages[pageIndex].scrollIntoView({ behavior: 'auto', block: 'start' });
      // 渲染当前页及前后各 1 页的 text layer
      for (let i = Math.max(0, pageIndex - 1); i <= Math.min(pages.length - 1, pageIndex + 1); i++) {
        this._renderPdfTextLayer(i);
      }
    }
    this._pdfCurrentPage = pageIndex;
    this._updatePdfPageIndicator();
    this._updatePdfProgress();
  },

  // ─── PDF：更新页码指示器 ───
  _updatePdfPageIndicator() {
    const numEl = document.getElementById('page-num');
    if (numEl) {
      if (this._dualPage && this._paginationMode) {
        const left = this._pdfCurrentPage + 1;
        const right = Math.min(this._pdfCurrentPage + 2, this._pdfTotalPages);
        numEl.textContent = left === right
          ? `${left} / ${this._pdfTotalPages}`
          : `${left}-${right} / ${this._pdfTotalPages}`;
      } else {
        numEl.textContent = `${this._pdfCurrentPage + 1} / ${this._pdfTotalPages}`;
      }
    }
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    if (prevBtn) prevBtn.disabled = this._pdfCurrentPage <= 0;
    const step = (this._dualPage && this._paginationMode) ? 2 : 1;
    if (nextBtn) nextBtn.disabled = this._pdfCurrentPage + step >= this._pdfTotalPages;
  },

  // ─── PDF：更新进度条 ───
  _updatePdfProgress() {
    const progress = this._pdfTotalPages > 1
      ? this._pdfCurrentPage / (this._pdfTotalPages - 1)
      : 0;
    document.getElementById('reader-progress-bar').style.width = (progress * 100) + '%';
  },

  // ─── PDF：滚动监听（自动检测当前可见页） ───
  _setupPdfScrollNav() {
    const container = document.getElementById('reader-content');
    this._pdfScrollHandler = () => {
      const pages = container.querySelectorAll('.pdf-page');
      if (!pages.length) return;

      const containerTop = container.scrollTop;
      const containerMid = containerTop + container.clientHeight / 3;

      let closestPage = 0;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].offsetTop <= containerMid) {
          closestPage = i;
        } else {
          break;
        }
      }

      if (closestPage !== this._pdfCurrentPage) {
        this._pdfCurrentPage = closestPage;
        this._updatePdfPageIndicator();
        this._updatePdfProgress();
        // 滚动时渲染当前页及前后页的 text layer
        for (let i = Math.max(0, closestPage - 1); i <= Math.min(pages.length - 1, closestPage + 1); i++) {
          this._renderPdfTextLayer(i);
        }
      }
    };
    container.addEventListener('scroll', this._pdfScrollHandler, { passive: true });
  },

  // ─── PDF：清理滚动监听 ───
  _removePdfScrollNav() {
    if (this._pdfScrollHandler) {
      const container = document.getElementById('reader-content');
      container.removeEventListener('scroll', this._pdfScrollHandler);
      this._pdfScrollHandler = null;
    }
  },

  // ─── PDF：反色显示控制 ───
  setPdfDarkMode(mode) {
    this._pdfDarkMode = mode; // 'light' | 'dark' | 'auto'
    // 持久化
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.pdfDarkMode = mode;
    localStorage.setItem('read-layout', JSON.stringify(saved));
    // 应用
    this._applyPdfDarkMode();
    // 同步按钮
    document.querySelectorAll('.typo-btn[data-param="pdfDark"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === mode);
    });
  },

  _applyPdfDarkMode() {
    const container = document.getElementById('reader-content');
    if (!container) return;
    let shouldInvert = false;
    if (this._pdfDarkMode === 'dark') {
      shouldInvert = true;
    } else if (this._pdfDarkMode === 'auto') {
      // 跟随应用主题
      shouldInvert = document.documentElement.getAttribute('data-theme') === 'dark';
    }
    // else 'light' → 不反色
    container.classList.toggle('pdf-inverted', shouldInvert);
  },

  // ─── PDF：切换分页/滚动显示 ───
  _togglePdfPagination(paginated) {
    const container = document.getElementById('reader-content');
    const pageInner = document.getElementById('page-indicator-inner');
    if (paginated) {
      container.classList.add('pdf-paginated');
      // 恢复双页 CSS 类（如果之前已开启）
      container.classList.toggle('pdf-dual-page', this._dualPage);
      // 移除滚动监听（分页模式不需要）
      this._removePdfScrollNav();
      // 绑定翻页触摸区和滚轮翻页
      this._setupTapZones();
      this._setupWheelNav();
      // 显示页码区
      if (pageInner) pageInner.classList.add('active');
      // 通过 _showPdfPage 应用单/双页显示逻辑
      this._showPdfPage(this._pdfCurrentPage);
    } else {
      container.classList.remove('pdf-paginated', 'pdf-dual-page');
      // 显示所有页
      container.querySelectorAll('.pdf-page').forEach(p => {
        p.style.display = '';
      });
      // 移除翻页触摸区和滚轮翻页
      this._removeTapZones();
      this._removeWheelNav();
      // 隐藏页码区
      if (pageInner) pageInner.classList.remove('active');
      // 重新绑定滚动监听
      this._setupPdfScrollNav();
      // 滚动到当前页
      this._showPdfPage(this._pdfCurrentPage);
    }
    this._updatePdfPageIndicator();
    this._updatePdfProgress();
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
    document.getElementById('toc-backdrop').classList.add('active');
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
        // offsetLeft 相对于 offsetParent（#reader-content），需减去容器 padding
        const container = document.getElementById('reader-content');
        const padL = parseFloat(getComputedStyle(container).paddingLeft) || 0;
        const elLeft = entry.el.offsetLeft - padL;
        const page = Math.floor(elLeft / this._pageWidth);
        this.goToPage(page);
      } else {
        entry.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    document.getElementById('toc-panel').classList.remove('active');
    document.getElementById('toc-backdrop').classList.remove('active');
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
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '正在分析…';

    const resetBtn = () => {
      btn.textContent = 'AI 自动提取全书背景';
      btn.disabled = false;
    };

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
          resetBtn();
          App.log('info', 'Reader', '背景提取完成');
          App.showToast('背景分析完成');
        },
        (err) => {
          resetBtn();
          App.log('error', 'Reader', '背景提取失败: ' + err.message, err);
          App.showToast('分析失败：' + err.message);
        }
      );
    } catch (e) {
      resetBtn();
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
      id: 'n' + Date.now(),
      bookId: this.currentBook.id,
      quote: this.selectedText,
      type: type,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await Store.put('notes', note);
    
    // 高亮文本
    this.highlightText(this.selectedRange, note.id);
    
    // 清除选择
    window.getSelection().removeAllRanges();
    document.getElementById('selection-dock').classList.remove('active');
    this.selectedText = '';
    this.selectedRange = null;

    if (type === 'ai') {
      await this.openAIChat(note.id);
      // 自动发起第一条消息
      this.sendAIMessage(`我读到了这段：\n"${note.quote}"\n\n你怎么看？`);
    } else {
      App.showToast('已存入笔记');
    }

    return note.id;
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
    // PDF 模式：先异步提取当前页文字
    if (this._isPdf) {
      await this.getPdfCurrentPageText();
    }
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
    // PDF 模式：按需提取当前页文字（异步，但此处返回同步缓存值）
    if (this._isPdf) {
      return this._pdfPageTextCache || '（PDF 当前页文字提取中…）';
    }

    const content = this.currentBook?.content;
    if (!content || !quote) return '';
    
    const index = content.indexOf(quote);
    if (index === -1) return '';

    const start = Math.max(0, index - 500);
    const end = Math.min(content.length, index + quote.length + 500);
    
    return content.substring(start, end);
  },

  // ─── PDF：提取当前页文字供 AI 使用 ───
  async getPdfCurrentPageText() {
    if (!this.currentBook?.pdfData) return '';
    const pageNum = (this._pdfCurrentPage || 0) + 1; // pdfjs 页码从 1 开始
    try {
      const text = await Parser.extractPdfText(this.currentBook.pdfData, pageNum);
      this._pdfPageTextCache = text;
      return text;
    } catch (e) {
      console.warn('PDF 当前页文字提取失败:', e);
      return '';
    }
  },

  // ─── 复制消息 ───
  async copyMessage(index) {
    const note = await Store.get('notes', this.currentNoteId);
    if (!note || !note.messages[index]) return;
    navigator.clipboard.writeText(note.messages[index].content)
      .then(() => App.showToast('已复制'))
      .catch(() => App.showToast('复制失败，请手动选择'));
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
  // 代理 App.escapeHtml，避免重复实现（App 始终先于 Reader 加载）
  escapeHtml(text) {
    return App.escapeHtml(text);
  },

  formatText(text) {
    return this.escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },

  // ─── 排版快捷面板 ───
  showTypography() {
    // PDF 模式下排版面板仅显示阅读配色，隐藏文字排版选项
    const isPdf = this._isPdf;
    document.querySelectorAll('#typography-scroll .typo-group').forEach(group => {
      // 阅读模式、版式 按钮组也不适用于 PDF
      const btns = group.querySelectorAll('.typo-btn[data-param]');
      if (btns.length > 0) {
        const param = btns[0].dataset.param;
        // 字号、行高、间距、版式 —— PDF 下隐藏（保留「模式」供 PDF 滚动/分页切换）
        if (['size', 'line', 'padding', 'columns'].includes(param)) {
          group.style.display = isPdf ? 'none' : '';
        }
      }
    });
    // 内嵌滑块行：PDF 模式下强制隐藏，非 PDF 时清除内联样式让 CSS 类控制
    document.querySelectorAll('#typography-scroll .typo-inline-slider').forEach(row => {
      row.style.display = isPdf ? 'none' : '';
    });
    // 字体 chip 区也隐藏
    const fontLabel = document.querySelector('#typography-scroll .typo-section-label');
    const fontChips = document.getElementById('typo-font-chips');
    if (fontLabel) fontLabel.style.display = isPdf ? 'none' : '';
    if (fontChips) fontChips.style.display = isPdf ? 'none' : '';

    // PDF 显示模式控制（明亮/暗色/自动）
    const pdfDarkGroup = document.getElementById('typo-pdf-dark');
    if (pdfDarkGroup) {
      pdfDarkGroup.style.display = isPdf ? '' : 'none';
      if (isPdf) {
        document.querySelectorAll('.typo-btn[data-param="pdfDark"]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === this._pdfDarkMode);
        });
      }
    }

    // 同步当前 CSS 变量值到按钮和滑块
    const root = document.documentElement;
    const curSize = getComputedStyle(root).getPropertyValue('--read-size').trim() || '19px';
    const curLine = getComputedStyle(root).getPropertyValue('--read-line').trim() || '1.85';
    const curPx   = getComputedStyle(root).getPropertyValue('--read-px').trim()   || '24px';

    this._syncTypoButtons('size',    curSize);
    this._syncTypoButtons('line',    curLine);
    this._syncTypoButtons('padding', curPx);

    // 同步滑块值和标签
    const sizeSlider = document.getElementById('slider-size');
    if (sizeSlider) sizeSlider.value = parseFloat(curSize);
    this.syncSliderLabel('size-val', curSize);

    const lineSlider = document.getElementById('slider-line');
    if (lineSlider) lineSlider.value = parseFloat(curLine);
    this.syncSliderLabel('line-val', curLine);

    const padSlider = document.getElementById('slider-padding');
    if (padSlider) padSlider.value = parseFloat(curPx);
    this.syncSliderLabel('padding-val', curPx);

    // 同步自定义按钮激活状态（反映滑块是否展开）
    ['size', 'line', 'padding'].forEach(param => {
      const sliderRow = document.getElementById(`slider-row-${param}`);
      const customBtn = document.querySelector(`.typo-custom-btn[data-param="${param}"]`);
      if (sliderRow && customBtn) {
        customBtn.classList.toggle('active', sliderRow.classList.contains('expanded'));
      }
    });

    // 同步首行缩进按钮
    document.querySelectorAll('.typo-btn[data-param="indent"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'on') === (this._forceIndent || false));
    });
    // 缩进行仅在非 PDF 模式下显示
    const indentGroup = document.getElementById('typo-indent-group');
    if (indentGroup) indentGroup.style.display = isPdf ? 'none' : '';

    // 同步阅读模式按钮
    document.querySelectorAll('.typo-btn[data-param="mode"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'paginated') === this._paginationMode);
    });

    // 同步单/双页按钮
    document.querySelectorAll('.typo-btn[data-param="columns"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'dual') === this._dualPage);
    });

    // 控制「版式」行的可见性（分页模式下显示，含 PDF 分页）
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

    // 字体变更会影响文字宽度，分页模式下需重算分页
    if (this._paginationMode) {
      clearTimeout(this._typoRecalcTimer);
      this._typoRecalcTimer = setTimeout(() => this.recalcPages(), 200);
    }
  },

  // 渲染「字」面板中的配色 chip（与全局配色库同步：内置 COLOR_PRESETS + 用户方案）
  renderTypoColorChips() {
    const container = document.getElementById('typo-color-chips');
    if (!container) return;

    // 读取当前阅读配色 override（用于标记激活项）
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    const activeBg = saved.readBg || null;

    // 内置配色
    const builtinHtml = (typeof COLOR_PRESETS !== 'undefined' ? COLOR_PRESETS : []).map(p => {
      const isActive = activeBg === p.bg ? ' active' : '';
      return `<div class="typo-color-chip${isActive}" style="background:${p.bg};"
        title="${App.escapeHtml(p.name)}"
        onclick="Reader.setReadColor('${p.bg}','${p.ink}',this)"></div>`;
    }).join('');

    // 用户自定义配色
    const userSchemes = JSON.parse(localStorage.getItem('color-schemes') || '[]');
    const userHtml = userSchemes.map(s => {
      const isActive = activeBg === s.bg ? ' active' : '';
      return `<div class="typo-color-chip${isActive}" style="background:${s.bg};"
        title="${App.escapeHtml(s.name)}"
        onclick="Reader.setReadColor('${s.bg}','${s.ink}',this)"></div>`;
    }).join('');

    container.innerHTML = builtinHtml + userHtml;
  },

  // 设置阅读区专属配色（--read-bg / --read-ink，不影响全局）
  // 同时记录当前全局 --bg 快照，用于检测全局配色是否已变更
  setReadColor(bg, ink, el) {
    const content = document.getElementById('reader-content');
    if (content) {
      content.style.setProperty('--read-bg',  bg);
      content.style.setProperty('--read-ink', ink);
    }
    // 更新 chip 激活状态
    document.querySelectorAll('.typo-color-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    // 持久化：同时保存全局色快照（用于软性联动检测）
    const globalBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.readBg = bg;
    saved.readInk = ink;
    saved.readColorGlobalSnapshot = globalBg;
    localStorage.setItem('read-layout', JSON.stringify(saved));
  },

  // 清除阅读配色 override，回退到全局配色（由 settings.js 在全局配色变更时调用）
  clearReadColorOverride() {
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    delete saved.readBg;
    delete saved.readInk;
    delete saved.readColorGlobalSnapshot;
    localStorage.setItem('read-layout', JSON.stringify(saved));
    // 清除 reader-content 上的内联 CSS 变量，回退到全局 --bg/--ink
    const content = document.getElementById('reader-content');
    if (content) {
      content.style.removeProperty('--read-bg');
      content.style.removeProperty('--read-ink');
    }
    // 若字面板已打开，刷新 chip 激活状态
    if (document.getElementById('typography-panel')?.classList.contains('active')) {
      this.renderTypoColorChips();
    }
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

    // 同步按钮激活状态 & 自定义滑块展开/收起
    this._syncTypoButtons(param, value);

    // 点击预设按钮时收起自定义滑块；滑块拖动时（btn=null）展开并激活自定义按钮
    if (btn) {
      // 预设按钮被点击 → 收起滑块
      const sliderRow = document.getElementById(`slider-row-${param}`);
      if (sliderRow) sliderRow.classList.remove('expanded');
    }
    // 若 btn 为 null（滑块拖动），_syncTypoButtons 已处理激活状态；
    // 滑块行本身已是 expanded（用户点击"自定义"后展开），无需额外操作

    // 持久化（与设置页共享同一 key）
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved[param] = value;
    localStorage.setItem('read-layout', JSON.stringify(saved));

    // 分页模式下，字号/行高/页边距变更会影响多栏排版，需重算分页
    if (this._paginationMode) {
      clearTimeout(this._typoRecalcTimer);
      this._typoRecalcTimer = setTimeout(() => this.recalcPages(), 120);
    }
  },

  // 同步按钮激活状态（自定义按钮激活状态由滑块展开状态决定，不由值决定）
  _syncTypoButtons(param, currentValue) {
    document.querySelectorAll(`.typo-btn[data-param="${param}"]`).forEach(btn => {
      if (btn.dataset.value === 'custom') return; // 自定义按钮单独处理
      btn.classList.toggle('active', btn.dataset.value === currentValue);
    });
    // 自定义按钮激活状态 = 滑块是否展开
    const sliderRow = document.getElementById(`slider-row-${param}`);
    const customBtn = document.querySelector(`.typo-custom-btn[data-param="${param}"]`);
    if (customBtn && sliderRow) {
      customBtn.classList.toggle('active', sliderRow.classList.contains('expanded'));
    }
  },

  // 从 localStorage 恢复排版设置（open() 时调用）
  restoreTypography() {
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    const root = document.documentElement;
    if (saved.size)    root.style.setProperty('--read-size', saved.size);
    if (saved.line)    root.style.setProperty('--read-line', saved.line);
    if (saved.padding) root.style.setProperty('--read-px',   saved.padding);
    // 恢复阅读专属配色（软性联动：若全局配色已变更，则清除 override）
    const rc = document.getElementById('reader-content');
    if (rc) {
      if (saved.readBg && saved.readInk) {
        // 检查全局配色是否自上次设置 override 后发生了变化
        const currentGlobalBg = getComputedStyle(root).getPropertyValue('--bg').trim();
        const snapshot = saved.readColorGlobalSnapshot || '';
        if (snapshot && snapshot !== currentGlobalBg) {
          // 全局配色已变更，清除 override，回退到全局色
          delete saved.readBg;
          delete saved.readInk;
          delete saved.readColorGlobalSnapshot;
          localStorage.setItem('read-layout', JSON.stringify(saved));
        } else {
          rc.style.setProperty('--read-bg',  saved.readBg);
          rc.style.setProperty('--read-ink', saved.readInk);
        }
      }
    }
    // 恢复阅读模式
    this._paginationMode = saved.paginationMode || false;
    this._dualPage = saved.dualPage || false;
    // 恢复 PDF 反色模式
    this._pdfDarkMode = saved.pdfDarkMode || 'auto';
    // 恢复首行缩进
    this._forceIndent = saved.forceIndent || false;
    const content = document.getElementById('reader-content');
    if (content) content.classList.toggle('force-indent', this._forceIndent);
  },

  // 切换首行缩进（供「字」面板按钮调用）
  toggleIndent(on) {
    this._forceIndent = on;
    // 持久化
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.forceIndent = on;
    localStorage.setItem('read-layout', JSON.stringify(saved));
    // 应用到内容区
    const content = document.getElementById('reader-content');
    if (content) content.classList.toggle('force-indent', on);
    // 同步按钮状态
    document.querySelectorAll('.typo-btn[data-param="indent"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'on') === on);
    });
  },

  // 切换自定义滑块展开/收起（供「字」面板"自定义"按钮调用）
  toggleCustomSlider(param) {
    const sliderRow = document.getElementById(`slider-row-${param}`);
    if (!sliderRow) return;
    const isExpanded = sliderRow.classList.toggle('expanded');
    // 同步自定义按钮激活状态
    const customBtn = document.querySelector(`.typo-custom-btn[data-param="${param}"]`);
    if (customBtn) customBtn.classList.toggle('active', isExpanded);
    // 若展开，确保滑块值与当前 CSS 变量同步
    if (isExpanded) {
      const varMap = { size: '--read-size', line: '--read-line', padding: '--read-px' };
      const cssVar = varMap[param];
      if (cssVar) {
        const curVal = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
        const slider = document.getElementById(`slider-${param}`);
        if (slider && curVal) slider.value = parseFloat(curVal);
        const labelId = param === 'padding' ? 'padding-val' : `${param}-val`;
        this.syncSliderLabel(labelId, curVal);
      }
    }
  },

  // ═══ 分页引擎 ═══
  // 注：_paginationMode, _currentPage, _totalPages, _pageWidth, _dualPage
  // 已在对象顶部声明初始值，此处不再重复声明。

  // 切换分页/滚动模式
  togglePaginationMode(mode) {
    this._paginationMode = mode;
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    saved.paginationMode = mode;
    localStorage.setItem('read-layout', JSON.stringify(saved));

    // PDF 模式走专用分页切换
    if (this._isPdf) {
      this._togglePdfPagination(mode);
    } else if (mode) {
      this.enablePagination();
    } else {
      this.disablePagination();
    }
    // 同步按钮状态
    document.querySelectorAll('.typo-btn[data-param="mode"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'paginated') === mode);
    });
    // 显示/隐藏版式选项（分页模式下显示，含 PDF）
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

    if (this._isPdf) {
      // PDF 双页模式：添加/移除 CSS 类，刷新当前显示
      container.classList.toggle('pdf-dual-page', dual);
      if (this._paginationMode) {
        this._showPdfPage(this._pdfCurrentPage);
      }
    } else {
      container.classList.toggle('dual-page', dual);
      // EPUB/TXT 分页模式下重算
      if (this._paginationMode) {
        this.recalcPages();
      }
    }

    // 同步按钮状态
    document.querySelectorAll('.typo-btn[data-param="columns"]').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.value === 'dual') === dual);
    });
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
    const indicator = document.getElementById('page-indicator-inner');
    if (indicator) indicator.classList.add('active');

    // 添加翻页触摸区
    this._setupTapZones();
    this._setupSwipeGesture();
    this._setupKeyboardNav();
    this._setupWheelNav();
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
    const indicator = document.getElementById('page-indicator-inner');
    if (indicator) indicator.classList.remove('active');

    // 移除翻页触摸区
    this._removeTapZones();
    this._removeSwipeGesture();
    this._removeKeyboardNav();
    this._removeWheelNav();

    // 重新绑定滚动监听
    this._scrollHandler = () => this.updateProgress();
    container.addEventListener('scroll', this._scrollHandler, { passive: true });
  },

  // ─── 阅读位置锚定：字符偏移锚点（简化版 CFI） ───
  //
  // 原理（参考主流 EPUB 阅读器的 CFI 方案）：
  //   1. 捕获：用 TreeWalker 遍历 .page-columns 内所有文本节点，
  //      累加字符数，找到当前页第一个可见文本节点，
  //      记录其全局字符偏移（charOffset）。
  //      "当前页第一个文本节点"通过 offsetLeft 判断：
  //      只需找到第一个 offsetLeft >= pageStart 的文本节点父元素即可，
  //      仅读一次 offsetLeft，不循环触发重排。
  //   2. 恢复：重排后再次用 TreeWalker 遍历，累加到 charOffset，
  //      找到对应文本节点，读一次 offsetLeft 定位新页码。
  //
  // 降级：若 _totalPages <= 1 或捕获失败，回退到比例方案。
  _captureAnchor() {
    const container = document.getElementById('reader-content');
    const wrapper = container.querySelector('.page-columns');
    if (!wrapper || !this._pageWidth || !this._totalPages) return null;

    // 降级：第 0 页直接返回 charOffset=0
    if (this._currentPage === 0) return { charOffset: 0 };

    const cs = getComputedStyle(container);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const pageStart = this._currentPage * this._pageWidth;

    // TreeWalker 遍历文本节点，累加字符偏移
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue && node.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    let charOffset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) { charOffset += node.nodeValue.length; continue; }
      // 只对"可能在当前页"的节点读一次 offsetLeft
      const elLeft = parent.offsetLeft - padL;
      if (elLeft >= pageStart) {
        // 找到当前页第一个文本节点，记录此时的累计偏移
        return { charOffset };
      }
      charOffset += node.nodeValue.length;
    }

    // 未找到（已在最后一页），回退到比例
    return { ratio: this._currentPage / this._totalPages };
  },

  // 计算总页数（核心：正确处理 padding、单/双页）
  recalcPages() {
    const container = document.getElementById('reader-content');
    const wrapper = container.querySelector('.page-columns');
    if (!wrapper) return;

    // ── 重排前：捕获当前页首行锚点 ──
    const anchor = this._captureAnchor();

    // 重算时临时禁用翻页动画，避免滑块拖动时抖动
    wrapper.style.transition = 'none';

    // 获取 padding 值（只读取，不修改）
    const cs = getComputedStyle(container);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;

    // 内容区可用尺寸（扣除 padding）
    let contentW = container.clientWidth - padL - padR;
    // 底栏常驻，高度固定，内容区高度直接使用 clientHeight（底栏在 flex 布局外）
    let contentH = container.clientHeight - padT - padB;

    // 兜底保护：确保有效数值（不修改 DOM padding，仅限制计算值）
    contentW = Math.max(contentW, 200);
    contentH = Math.max(contentH, 120);

    // 列间距 = padL + padR（将下一列推出 padding-box 裁切区）
    const pageGap = padL + padR;

    if (this._dualPage) {
      // 双页：2 列可见
      // 不对 colW 取整——column-count:2 已确定列数，浏览器会精确分配列宽
      const colW = (contentW - pageGap) / 2;
      wrapper.style.columnCount = '2';
      wrapper.style.columnWidth = Math.max(colW, 100) + 'px';
      wrapper.style.columnGap = pageGap + 'px';
      // _pageWidth 直接用 contentW + pageGap，与浏览器实际步进一致，
      // 避免从取整后的 colW 反推导致每页累积偏移
      this._pageWidth = contentW + pageGap;
    } else {
      // 单页：1 列 = contentW
      wrapper.style.columnCount = '1';
      wrapper.style.columnWidth = Math.round(contentW) + 'px';
      wrapper.style.columnGap = pageGap + 'px';
      // _pageWidth 先用估算值，待浏览器重排后从 scrollWidth 反推精确值
      this._pageWidth = Math.round(contentW + pageGap);
    }

    wrapper.style.height = contentH + 'px';

    // 等待浏览器重排后再测量 scrollWidth
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sw = wrapper.scrollWidth;
        // ── 关键修复：从实际 scrollWidth 反推每页真实步进 ──
        // 浏览器在高 DPR 设备上排版时会做亚像素对齐，导致实际列宽
        // 与 JS 计算的 _pageWidth 存在误差，翻页越多累积偏移越大。
        // 解决：用估算值先算出总页数，再以 scrollWidth/totalPages 为精确步进。
        const estimatedPages = Math.max(1, Math.round(sw / this._pageWidth));
        // 用 scrollWidth 整除总页数得到精确步进，消除亚像素累积误差
        this._pageWidth = sw / estimatedPages;
        this._totalPages = estimatedPages;

        // ── 重排后：按字符偏移恢复页码（简化版 CFI） ──
        if (anchor && anchor.charOffset != null) {
          if (anchor.charOffset === 0) {
            this._currentPage = 0;
          } else {
            // 重新遍历文本节点，累加到 charOffset，找对应节点的新页码
            const walker2 = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
              acceptNode(node) {
                return node.nodeValue && node.nodeValue.trim()
                  ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
              }
            });
            let accumulated = 0;
            let found = false;
            let tn;
            while ((tn = walker2.nextNode())) {
              const len = tn.nodeValue.length;
              if (accumulated + len > anchor.charOffset) {
                // 找到目标节点，读一次 offsetLeft 定位新页码
                const parent = tn.parentElement;
                if (parent) {
                  const elLeft = parent.offsetLeft - padL;
                  const newPage = Math.floor(elLeft / this._pageWidth);
                  this._currentPage = Math.max(0, Math.min(newPage, this._totalPages - 1));
                  found = true;
                }
                break;
              }
              accumulated += len;
            }
            if (!found) {
              this._currentPage = Math.min(this._currentPage, this._totalPages - 1);
            }
          }
        } else if (anchor && anchor.ratio != null) {
          // 降级：比例方案
          const newPage = Math.round(anchor.ratio * this._totalPages);
          this._currentPage = Math.max(0, Math.min(newPage, this._totalPages - 1));
        } else if (this._currentPage >= this._totalPages) {
          this._currentPage = this._totalPages - 1;
        }

        // 无动画跳到当前页，再恢复 transition
        this.goToPage(this._currentPage);
        // 下一帧恢复动画，以便用户手动翻页时有过渡效果
        requestAnimationFrame(() => {
          wrapper.style.transition = '';
        });
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
    if (this._isPdf) {
      const step = (this._dualPage && this._paginationMode) ? 2 : 1;
      const target = this._pdfCurrentPage - step;
      if (target >= 0) this._showPdfPage(target);
      else if (this._pdfCurrentPage > 0) this._showPdfPage(0);
      return;
    }
    if (this._currentPage > 0) {
      this.goToPage(this._currentPage - 1);
    }
  },

  // 下一页
  nextPage() {
    if (this._isPdf) {
      const step = (this._dualPage && this._paginationMode) ? 2 : 1;
      const target = this._pdfCurrentPage + step;
      if (target < this._pdfTotalPages) this._showPdfPage(target);
      return;
    }
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
  // 策略：tap zone 本身 pointer-events:none（不拦截任何事件），
  // 改在 reader-overlay 上监听 mousedown/touchstart，
  // 根据坐标判断是否落在左/右 30% 区域，再区分点击与拖拽。
  // Y 轴限制：只在 #reader-content 的实际内容区内响应，排除顶栏和底栏。
  _setupTapZones() {
    this._removeTapZones();
    const overlay = document.getElementById('reader-overlay');

    // 获取内容区 Y 轴有效范围（排除顶栏 header，底栏已在 flex 布局中独立）
    const _getContentYRange = () => {
      const content = document.getElementById('reader-content');
      if (!content) return { top: 48, bottom: window.innerHeight - 48 };
      const rect = content.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };

    let downX = 0, downY = 0, downTime = 0;

    this._tapMouseDown = (e) => {
      downX = e.clientX; downY = e.clientY; downTime = Date.now();
    };
    this._tapMouseUp = (e) => {
      // 有文字选中则不翻页
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      // 移动超过 8px 视为拖拽
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) return;
      // 按下时间超过 500ms 视为长按，不翻页
      if (Date.now() - downTime > 500) return;
      // Y 轴：必须在内容区内（排除顶栏和底栏）
      const { top, bottom } = _getContentYRange();
      const y = e.clientY;
      if (y < top || y > bottom) return;
      // 判断点击区域（相对于视口宽度）
      const w = window.innerWidth;
      const x = e.clientX;
      if (x < w * 0.3) this.prevPage();
      else if (x > w * 0.7) this.nextPage();
    };

    this._tapTouchStart = (e) => {
      downX = e.touches[0].clientX;
      downY = e.touches[0].clientY;
      downTime = Date.now();
    };
    this._tapTouchEnd = (e) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - downX;
      const dy = t.clientY - downY;
      // 移动超过 8px 视为划词/滚动，不翻页
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
      // 按下时间超过 500ms 视为长按，不翻页
      if (Date.now() - downTime > 500) return;
      // Y 轴：必须在内容区内（排除顶栏和底栏）
      const { top, bottom } = _getContentYRange();
      const y = t.clientY;
      if (y < top || y > bottom) return;
      const w = window.innerWidth;
      const x = t.clientX;
      if (x < w * 0.3) this.prevPage();
      else if (x > w * 0.7) this.nextPage();
    };

    overlay.addEventListener('mousedown', this._tapMouseDown);
    overlay.addEventListener('mouseup', this._tapMouseUp);
    overlay.addEventListener('touchstart', this._tapTouchStart, { passive: true });
    overlay.addEventListener('touchend', this._tapTouchEnd, { passive: true });
  },

  _removeTapZones() {
    const overlay = document.getElementById('reader-overlay');
    if (this._tapMouseDown)  overlay.removeEventListener('mousedown',  this._tapMouseDown);
    if (this._tapMouseUp)    overlay.removeEventListener('mouseup',    this._tapMouseUp);
    if (this._tapTouchStart) overlay.removeEventListener('touchstart', this._tapTouchStart);
    if (this._tapTouchEnd)   overlay.removeEventListener('touchend',   this._tapTouchEnd);
    this._tapMouseDown = null;
    this._tapMouseUp   = null;
    this._tapTouchStart = null;
    this._tapTouchEnd   = null;
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
      if (!this._paginationMode && !this._isPdf) return;
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
  },

  // ─── 鼠标滚轮翻页 ───
  _setupWheelNav() {
    this._removeWheelNav();
    // 节流：两次滚轮翻页间隔至少 350ms，避免连续触发
    // 分页模式下 #reader-content 已 overflow:hidden，无需 preventDefault
    let lastWheel = 0;
    this._wheelHandler = (e) => {
      if (!this._paginationMode) return;
      // 若有文字选中则不翻页
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const now = Date.now();
      if (now - lastWheel < 350) return;
      lastWheel = now;
      if (e.deltaY > 0 || e.deltaX > 0) {
        this.nextPage();
      } else if (e.deltaY < 0 || e.deltaX < 0) {
        this.prevPage();
      }
    };
    const overlay = document.getElementById('reader-overlay');
    // passive:true —— 不阻塞浏览器滚动线程，消除延迟
    overlay.addEventListener('wheel', this._wheelHandler, { passive: true });
  },

  _removeWheelNav() {
    if (this._wheelHandler) {
      const overlay = document.getElementById('reader-overlay');
      overlay.removeEventListener('wheel', this._wheelHandler);
      this._wheelHandler = null;
    }
  },

  // ─── 文内锚点跳转（EPUB 内部 #xxx 链接） ───
  _setupAnchorNav() {
    this._removeAnchorNav();
    const container = document.getElementById('reader-content');

    this._anchorClickHandler = (e) => {
      // 找到最近的带 data-anchor 属性的 <a> 元素
      const link = e.target.closest('a[data-anchor]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();

      const targetId = link.dataset.anchor;
      const targetEl = container.querySelector(`[id="${CSS.escape(targetId)}"]`);
      if (!targetEl) return;

      if (this._paginationMode) {
        // 分页模式：找到目标元素所在页并跳转
        const wrapper = container.querySelector('.page-columns');
        if (!wrapper) return;
        const padL = parseFloat(getComputedStyle(container).paddingLeft) || 0;
        const elLeft = targetEl.offsetLeft - padL;
        const page = Math.floor(elLeft / this._pageWidth);
        this.goToPage(Math.max(0, Math.min(page, this._totalPages - 1)));
      } else {
        // 滚动模式：直接滚动到目标元素
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    container.addEventListener('click', this._anchorClickHandler);
  },

  _removeAnchorNav() {
    if (this._anchorClickHandler) {
      const container = document.getElementById('reader-content');
      if (container) container.removeEventListener('click', this._anchorClickHandler);
      this._anchorClickHandler = null;
    }
  },

  // ─── EPUB 图片填充：将 data-epub-src 替换为 imageMap 中的 dataURL ───
  _resolveEpubImages(imageMap) {
    const container = document.getElementById('reader-content');
    if (!container) return;
    container.querySelectorAll('img[data-epub-src]').forEach(img => {
      // imageMap 不存在（旧版导入的书）：直接隐藏，避免显示 broken image
      if (!imageMap) {
        img.style.display = 'none';
        return;
      }
      const src = img.dataset.epubSrc;
      if (!src) { img.style.display = 'none'; return; }
      // 尝试多种 key 匹配：原始路径、去掉 ../ 前缀的路径、仅文件名
      const dataUrl = imageMap[src]
        || imageMap[src.replace(/^(\.\.\/)+/, '')]
        || imageMap[src.split('/').pop()];
      if (dataUrl) {
        img.src = dataUrl;
        img.removeAttribute('data-epub-src');
      } else {
        // 找不到对应图片：隐藏元素，避免显示破损图标
        img.style.display = 'none';
      }
    });
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
