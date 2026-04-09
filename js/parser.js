/* ═══════════════════════════════════════
   PARSER.JS - epub / pdf / txt 解析
   ═══════════════════════════════════════ */

const Parser = {
  // ─── HTML 安全过滤（白名单标签） ───
  _allowedTags: new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'em', 'i', 'strong', 'b', 'blockquote', 'ul', 'ol', 'li',
    'span', 'div', 'section', 'article', 'aside', 'header',
    'sup', 'sub', 'small', 'hr'
  ]),

  sanitizeHTML(bodyEl) {
    // 移除 script / style / img / svg / link 等不安全/不需要的元素
    bodyEl.querySelectorAll('script, style, link, img, svg, iframe, object, embed, video, audio, canvas, form, input, button').forEach(el => el.remove());
    // 移除所有内联 style 和 class 属性（保持纯净语义）
    bodyEl.querySelectorAll('*').forEach(el => {
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('id');
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
    const title = titleEl ? titleEl.textContent : file.name;

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
      content: textChapters.join('\n\n'),
      htmlContent: htmlChapters.join('<hr class="chapter-break">'),
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
