/* ═══════════════════════════════════════
   PARSER.JS - epub / pdf / txt 解析
   ═══════════════════════════════════════ */

const Parser = {
  // ─── HTML 安全过滤（白名单标签） ───
  _allowedTags: new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'em', 'i', 'strong', 'b', 'blockquote', 'ul', 'ol', 'li',
    'span', 'div', 'section', 'article', 'aside', 'header',
    'sup', 'sub', 'small', 'hr', 'a'
  ]),

  sanitizeHTML(bodyEl) {
    // 移除不安全/不需要的元素（保留 img，由调用方决定是否替换 src）
    bodyEl.querySelectorAll('script, style, link, svg, iframe, object, embed, video, audio, canvas, form, input, button').forEach(el => el.remove());
    // 清理属性
    bodyEl.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'IMG') {
        // img：先读取需要保留的属性，再清除所有属性，最后重设白名单属性
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        const cls = el.getAttribute('class') || '';
        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name);
        if (src) el.setAttribute('data-epub-src', src);
        if (alt) el.setAttribute('alt', alt);
        // 保留 class（供 CSS 样式规则匹配，如 hangz-illustrations 行内公式图片）
        if (cls) el.setAttribute('class', cls);
      } else if (el.tagName === 'A') {
        el.removeAttribute('style');
        el.removeAttribute('class');
        // 对 <a> 标签：只保留 #xxx 内部锚点，外部链接移除 href
        const href = el.getAttribute('href') || '';
        if (href.startsWith('#') && href.length > 1) {
          el.setAttribute('data-anchor', href.slice(1));
          el.removeAttribute('href');
        } else {
          el.removeAttribute('href');
        }
      } else {
        el.removeAttribute('style');
        el.removeAttribute('class');
        // 保留 id 属性（供锚点跳转目标使用）
      }
    });
    return bodyEl.innerHTML.trim();
  },

  // 解析 EPUB
  async parseEPUB(file) {
    const zip = await JSZip.loadAsync(file);
    const opfFile = Object.keys(zip.files).find(f => f.endsWith('.opf'));
    if (!opfFile) throw new Error('无效的 EPUB 文件');

    const opfText = await zip.file(opfFile).async('text');
    const parser = new DOMParser();
    const opfDoc = parser.parseFromString(opfText, 'text/xml');
    
    // 提取书名
    const titleEl = opfDoc.querySelector('title');
    const title = titleEl ? titleEl.textContent.trim() : file.name;

    // 提取作者（dc:creator，兼容带命名空间和不带命名空间两种写法）
    const creatorEl = opfDoc.querySelector('creator') || opfDoc.querySelector('dc\\:creator');
    const author = creatorEl ? creatorEl.textContent.trim() : '';

    // 提取章节
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    const spine = Array.from(opfDoc.querySelectorAll('spine itemref')).map(ref => {
      const idref = ref.getAttribute('idref');
      return manifest[idref];
    });

    const basePath = opfFile.substring(0, opfFile.lastIndexOf('/') + 1);
    const textChapters = [];
    const htmlChapters = [];

    // ─── 提取图片：相对路径 → base64 dataURL（单图 > 300KB 跳过）───
    const IMAGE_SIZE_LIMIT = 300 * 1024; // 300 KB（原始字节，base64 约 +33%）
    const IMAGE_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    const imageMap = {}; // { 'images/cover.jpg': 'data:image/jpeg;base64,...' }

    for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      const ext = zipPath.split('.').pop().toLowerCase();
      if (!IMAGE_MIME[ext]) continue;
      // 跳过超大图片
      const rawSize = zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0;
      if (rawSize > IMAGE_SIZE_LIMIT) continue;
      try {
        const bytes = await zipEntry.async('uint8array');
        if (bytes.length > IMAGE_SIZE_LIMIT) continue; // 二次检查实际大小
        // 转 base64（分块处理，避免大图触发调用栈溢出）
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const b64 = btoa(binary);
        const mime = IMAGE_MIME[ext];
        // 存两种 key：zip 全路径 和 相对于 basePath 的路径（章节 src 通常是相对路径）
        const relPath = zipPath.startsWith(basePath) ? zipPath.slice(basePath.length) : zipPath;
        imageMap[relPath] = `data:${mime};base64,${b64}`;
        imageMap[zipPath] = `data:${mime};base64,${b64}`; // 也存全路径备用
      } catch (e) {
        // 单张图片失败不影响整体
      }
    }

    for (const href of spine) {
      if (!href) continue;
      const fullPath = basePath + href;
      const chapterFile = zip.file(fullPath);
      if (chapterFile) {
        const html = await chapterFile.async('text');
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body.textContent.trim();
        if (text) {
          textChapters.push(text);
          htmlChapters.push(this.sanitizeHTML(doc.body));
        }
      }
    }

    return {
      title,
      author,
      content: textChapters.join('\n\n'),
      htmlContent: htmlChapters.join('<hr class="chapter-break">'),
      imageMap,   // { relPath: dataURL } 供阅读器渲染时填充 img src
      format: 'epub',
      size: file.size,
      chapters: textChapters.length
    };
  },

  // 解析 PDF —— canvas 分页渲染（保留原始视觉效果）
  async parsePDF(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDataCopy = arrayBuffer.slice(0); // 克隆一份，pdf.js 会 detach 原始 buffer
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const title = file.name.replace(/\.pdf$/i, '');
    const pdfPages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x 防模糊
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport
      }).promise;
      pdfPages.push(canvas.toDataURL('image/jpeg', 0.92));
      if (onProgress) onProgress(i, pdf.numPages);
    }

    return {
      title,
      content: '',           // PDF 不提取文字到 content（避免乱序错字）
      pdfPages,              // dataURL 数组，供阅读界面显示
      pdfData: pdfDataCopy,  // 克隆的数据，供 AI 按需提取文字（原始 buffer 已被 pdf.js detach）
      pdfScale: 2.0,         // 渲染缩放比，text layer 坐标对齐用
      format: 'pdf',
      size: file.size,
      chapters: pdf.numPages
    };
  },

  // AI 用：按需提取指定页纯文字（不在导入时调用）
  async extractPdfText(pdfData, pageNum) {
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise;
      if (pageNum < 1 || pageNum > pdf.numPages) return '';
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      return content.items.map(s => s.str).join(' ');
    } catch (e) {
      console.warn('PDF 文字提取失败:', e);
      return '';
    }
  },

  // 解析 TXT（支持 GBK 编码）
  async parseTXT(file) {
    // 优先从 localStorage 读取用户设置的编码
    const encoding = localStorage.getItem('sr_encoding') || 'utf-8';
    let text;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder(encoding);
      text = decoder.decode(arrayBuffer);
    } catch (e) {
      // 解码失败时回退 utf-8
      text = await file.text();
    }

    const title = file.name.replace(/\.txt$/i, '');
    
    // 简单按空行分章
    const chapters = text.split(/\n\n+/).filter(c => c.trim());

    return {
      title,
      content: text,
      format: 'txt',
      size: file.size,
      chapters: chapters.length
    };
  },

  // 统一入口
  async parse(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'epub') {
      return await this.parseEPUB(file);
    } else if (ext === 'pdf') {
      return await this.parsePDF(file);
    } else if (ext === 'txt') {
      return await this.parseTXT(file);
    } else {
      throw new Error('不支持的文件格式');
    }
  }
};
