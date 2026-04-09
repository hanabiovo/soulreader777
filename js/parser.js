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

  // 解析 PDF
  async parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const title = file.name.replace('.pdf', '');
    const chapters = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      if (text.trim()) chapters.push(text.trim());
    }

    return {
      title,
      content: chapters.join('\n\n'),
      format: 'pdf',
      size: file.size,
      chapters: pdf.numPages
    };
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
