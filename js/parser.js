/* ═══════════════════════════════════════
   PARSER.JS - epub / pdf / txt 解析
   ═══════════════════════════════════════ */

const Parser = {
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
    const chapters = [];
    
    for (const href of spine) {
      if (!href) continue;
      const fullPath = basePath + href;
      const chapterFile = zip.file(fullPath);
      if (chapterFile) {
        const html = await chapterFile.async('text');
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body.textContent.trim();
        if (text) chapters.push(text);
      }
    }

    return {
      title,
      content: chapters.join('\n\n'),
      format: 'epub',
      size: file.size,
      chapters: chapters.length
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
