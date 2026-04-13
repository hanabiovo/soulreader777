/* ═══════════════════════════════════════
   SETTINGS.JS - 设置页、主题、AI配置、字体/配色方案
   ═══════════════════════════════════════ */

// ─── 内置配色方案（完整 6 变量，避免 HSL alpha 推算问题）───
const COLOR_PRESETS = [
  {
    name: '纸白',
    bg: '#f7f5f0', ink: '#1a1a18',
    inkMid: '#6b6960', inkFaint: '#b8b5ae', inkGhost: '#dedad4',
    rule: '#e8e5de'
  },
  {
    name: '暗夜',
    bg: '#1a1c1e', ink: '#d4cfca',
    inkMid: '#8a8680', inkFaint: '#5a5855', inkGhost: '#2e3033',
    rule: '#2e3033'
  },
  {
    name: '石墨',
    bg: '#3a3a3a', ink: '#e8e5e0',
    inkMid: '#a8a5a0', inkFaint: '#686562', inkGhost: '#4a4a4a',
    rule: '#4a4a4a'
  },
  {
    name: '奶油',
    bg: '#fdf6e3', ink: '#2d2a24',
    inkMid: '#7a7568', inkFaint: '#c0b9a8', inkGhost: '#ede8d8',
    rule: '#ede8d8'
  },
  {
    name: '冷灰',
    bg: '#eef2f5', ink: '#1e2428',
    inkMid: '#6a7680', inkFaint: '#b0bcc4', inkGhost: '#dde3e8',
    rule: '#dde3e8'
  },
  {
    name: '暖褐',
    bg: '#f5ede3', ink: '#2a1f16',
    inkMid: '#7a6858', inkFaint: '#c0a898', inkGhost: '#e8d8c8',
    rule: '#e8d8c8'
  }
];

// ─── 内置字体预设（三槽制：标题 / 正文 / 界面 分别可选）───
const FONT_PRESETS = [
  { id:'default',   label:'默认',
    title:"'Noto Serif SC',serif",      body:"'Noto Sans SC',sans-serif",    ui:"'Noto Sans SC',sans-serif",
    url:null },
  { id:'src-serif', label:'思源宋',
    title:"'Noto Serif CJK',serif",     body:"'Noto Serif CJK',serif",       ui:"'Noto Serif CJK',serif",
    url:'https://fontsapi.zeoseven.com/285/main/result.css' },
  { id:'src-sans',  label:'思源黑',
    title:"'Noto Sans CJK',sans-serif", body:"'Noto Sans CJK',sans-serif",   ui:"'Noto Sans CJK',sans-serif",
    url:'https://fontsapi.zeoseven.com/69/main/result.css' },
  { id:'wenkai',    label:'霞鹜文楷',
    title:"'LXGW WenKai',serif",        body:"'LXGW WenKai',serif",          ui:"'LXGW WenKai',serif",
    url:'https://fontsapi.zeoseven.com/292/main/result.css' },
  { id:'jinghua',   label:'京华老宋',
    title:"'KingHwaOldSong',serif",     body:"'KingHwaOldSong',serif",        ui:"'KingHwaOldSong',serif",
    url:'https://fontsapi.zeoseven.com/309/main/result.css' },
  { id:'zhuque',    label:'朱雀仿宋',
    title:"'Zhuque Fangsong (technical preview)',serif", body:"'Zhuque Fangsong (technical preview)',serif", ui:"'Zhuque Fangsong (technical preview)',serif",
    url:'https://fontsapi.zeoseven.com/7/main/result.css' },
  { id:'huiwen',    label:'汇文仿宋',
    title:"'Huiwen-Fangsong',serif",    body:"'Huiwen-Fangsong',serif",       ui:"'Huiwen-Fangsong',serif",
    url:'https://fontsapi.zeoseven.com/440/main/result.css' },
  { id:'hanche',    label:'寒蝉点阵',
    title:"'寒蝉点阵体 16px',monospace", body:"'寒蝉点阵体 16px',monospace",  ui:"'寒蝉点阵体 16px',monospace",
    url:'https://fontsapi.zeoseven.com/359/main/result.css' },
  { id:'pxsong',    label:'屏显臻宋',
    title:"'Clear Han Serif',serif",    body:"'Clear Han Serif',serif",       ui:"'Clear Han Serif',serif",
    url:'https://fontsapi.zeoseven.com/79/main/result.css' },
];

// ─── 字体默认方案 ───
const FONT_DEFAULT_SCHEME = {
  id: 'scheme_default', label: '默认', isBuiltin: true,
  slotTitle: null, slotBody: null, slotUi: null,
};

// ─── 字体设置状态（三槽 + 方案管理 + 自定义字体列表）───
let fontSettings = JSON.parse(localStorage.getItem('lingxi_fonts')) || {
  customFonts:    [],
  slotTitle:      null,
  slotBody:       null,
  slotUi:         null,
  savedSchemes:   [],
  activeSchemeId: 'scheme_default',
};
// 迁移旧数据
if (!fontSettings.savedSchemes)           fontSettings.savedSchemes   = [];
if (!('activeSchemeId' in fontSettings))  fontSettings.activeSchemeId = 'scheme_default';
if (!fontSettings.customFonts)            fontSettings.customFonts   = [];

// ─── 字体外链加载（去重）───
const _loadedFontUrls = new Set();
function loadFontUrl(url) {
  if (!url || _loadedFontUrls.has(url)) return;
  _loadedFontUrls.add(url);
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = url;
  document.head.appendChild(link);
}

function saveFontSettings() {
  localStorage.setItem('lingxi_fonts', JSON.stringify(fontSettings));
}

function applyFontSettings() {
  const allFonts = [...FONT_PRESETS, ...fontSettings.customFonts];
  const dflt = FONT_PRESETS[0];
  const resolve = (slotId, prop) => {
    if (!slotId) return dflt[prop];
    const f = allFonts.find(x => x.id === slotId);
    if (f) { if (f.url) loadFontUrl(f.url); return f[prop]; }
    return dflt[prop];
  };
  const root = document.documentElement.style;
  root.setProperty('--font-title', resolve(fontSettings.slotTitle, 'title'));
  root.setProperty('--font-body',  resolve(fontSettings.slotBody,  'body'));
  root.setProperty('--font-ui',    resolve(fontSettings.slotUi,    'ui'));
}

const Settings = {
  theme: 'light', // 'light' | 'dark' | 'system'
  _mql: null,     // MediaQueryList for system theme
  _activeBuiltinColorIdx: -1, // -1 = 无内置激活（用户方案激活中或未选择）
  _schemeList: [],  // 字体方案列表缓存（含内置默认 + 用户保存的方案）

  // ─── 初始化 ───
  init() {
    this.loadTheme();
    this.loadReadLayout();
    this.loadAIConfig();
    this.renderPersonaList();
    this.renderColorSchemeList();
    // 字体系统初始化：预加载预设 + 用户字体，应用当前设置，渲染 UI
    FONT_PRESETS.forEach(f => { if (f.url) loadFontUrl(f.url); });
    (fontSettings.customFonts || []).forEach(f => { if (f.url) loadFontUrl(f.url); });
    applyFontSettings();
    this.renderFontSettings();
    // 封面风格初始化，默认方案 C
    this.loadCoverStyle();
    // 显示原书封面开关初始化
    this.loadCoverImageToggle();
  },

  // ─── 打开/关闭（兼容旧调用） ───
  open() {},
  close() {},

  // ─── 切换左侧 tab ───
  switchTab(tabName) {
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.stab === tabName);
    });
    document.querySelectorAll('.stab-page').forEach(page => {
      page.classList.remove('active');
    });
    const target = document.getElementById(`stab-${tabName}`);
    if (target) target.classList.add('active');

    if (tabName === 'appearance') this.syncThemeButtons();
  },

  // ─── 主题 ───
  loadTheme() {
    this.theme = localStorage.getItem('theme') || 'light';
    this._applyTheme();
  },

  setTheme(mode) {
    this.theme = mode;
    localStorage.setItem('theme', mode);
    this._applyTheme();
    this.syncThemeButtons();
    // 明暗模式切换时，清除阅读器配色 override（软性联动）
    if (typeof Reader !== 'undefined') Reader.clearReadColorOverride();
  },

  // 兼容旧调用（toggle light/dark）
  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  },

  // 同步更新 <meta name="theme-color">，让手机状态栏跟随主题色
  _syncThemeColor(isDark) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#141412' : '#f7f5f0');
  },

  _applyTheme() {
    // 清除旧的 system listener
    if (this._mql) {
      this._mql.removeEventListener('change', this._mqlHandler);
      this._mql = null;
    }

    if (this.theme === 'system') {
      this._mql = window.matchMedia('(prefers-color-scheme: dark)');
      this._mqlHandler = (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        this._syncThemeColor(e.matches);
        // 系统明暗切换时，清除阅读器配色 override（软性联动）
        if (typeof Reader !== 'undefined') Reader.clearReadColorOverride();
      };
      this._mql.addEventListener('change', this._mqlHandler);
      const isDark = this._mql.matches;
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      this._syncThemeColor(isDark);
    } else if (this.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      this._syncThemeColor(true);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      this._syncThemeColor(false);
    }
  },

  syncThemeButtons() {
    document.querySelectorAll('.sp-toggle-btn[data-theme]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === this.theme);
    });
  },

  // ─── 阅读排版（与「字」快捷面板共享 read-layout key）───
  loadReadLayout() {
    const saved = JSON.parse(localStorage.getItem('read-layout') || '{}');
    const root = document.documentElement;
    if (saved.size)    root.style.setProperty('--read-size', saved.size);
    if (saved.line)    root.style.setProperty('--read-line', saved.line);
    if (saved.padding) root.style.setProperty('--read-px',   saved.padding);
  },

  // ─── AI 配置 ───
  loadAIConfig() {
    const saved = JSON.parse(localStorage.getItem('ai-config') || '{}');
    const keyInput   = document.getElementById('ai-key-input');
    const urlInput   = document.getElementById('ai-url-input');
    const modelInput = document.getElementById('ai-model-input');

    if (keyInput)   keyInput.value   = saved.apiKey || '';
    if (urlInput)   urlInput.value   = saved.apiUrl || '';
    if (modelInput) modelInput.value = saved.model  || '';

    // 同步到 AI 模块
    if (saved.apiKey) AI.config.apiKey = saved.apiKey;
    if (saved.apiUrl) AI.config.apiUrl = saved.apiUrl;
    if (saved.model)  AI.config.model  = saved.model;

    // 加载激活人设
    this._applyActivePersona();
  },

  // 点击「应用」按钮：保存三个字段并同步 AI 模块
  applyAIConfig() {
    const config = {
      apiKey: document.getElementById('ai-key-input')?.value.trim() || '',
      apiUrl: document.getElementById('ai-url-input')?.value.trim() || '',
      model:  document.getElementById('ai-model-input')?.value.trim() || ''
    };
    // 保留已存储的人设数据不覆盖
    const existing = JSON.parse(localStorage.getItem('ai-config') || '{}');
    const merged = { ...existing, ...config };
    localStorage.setItem('ai-config', JSON.stringify(merged));

    AI.config.apiKey = config.apiKey;
    AI.config.apiUrl = config.apiUrl;
    AI.config.model  = config.model;
    App.showToast('AI 配置已应用');
  },

  // 拉取模型列表
  async fetchModels() {
    const url = document.getElementById('ai-url-input')?.value.trim();
    const key = document.getElementById('ai-key-input')?.value.trim();
    if (!url) { App.showToast('请先填写 API URL'); return; }

    // 构建 /models 端点：去掉末尾路径，取 base url
    let base = url.replace(/\/chat\/completions.*$/, '').replace(/\/+$/, '');
    try {
      App.showToast('正在拉取模型列表…');
      const res = await fetch(`${base}/models`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(res.status);
      const json = await res.json();
      const ids = (json.data || []).map(m => m.id).filter(Boolean);
      const dl = document.getElementById('ai-model-list');
      if (dl) {
        dl.innerHTML = ids.map(id => `<option value="${id}">`).join('');
      }
      App.showToast(`已加载 ${ids.length} 个模型`);
    } catch (e) {
      App.showToast('拉取失败：' + e.message);
    }
  },

  // 兼容旧调用（无 persona textarea）
  saveAIConfig() {
    this.applyAIConfig();
  },

  // ─── 人设库 ───
  _getPersonas() {
    return JSON.parse(localStorage.getItem('personas') || '[]');
  },

  _savePersonas(personas) {
    localStorage.setItem('personas', JSON.stringify(personas));
  },

  _applyActivePersona() {
    const personas = this._getPersonas();
    const active = personas.find(p => p.active);
    AI.config.persona = active ? active.content : '';
  },

  renderPersonaList() {
    const personas = this._getPersonas();
    const container = document.getElementById('persona-list');
    if (!container) return;

    container.innerHTML = personas.map((p, i) => `
      <div class="sp-persona-item${p.active ? ' active' : ''}" data-index="${i}">
        <div class="sp-persona-header">
          <div class="sp-persona-active-dot"></div>
          <input class="sp-persona-name-input" value="${App.escapeHtml(p.name)}"
            onchange="Settings._updatePersonaName(${i},this.value)"
            onclick="Settings._activatePersona(${i})">
          <span class="sp-persona-activate" onclick="Settings._activatePersona(${i})">
            ${p.active ? '已激活' : '激活'}
          </span>
          <span class="sp-persona-delete" onclick="Settings._deletePersona(${i})">✕</span>
        </div>
        <textarea class="sp-persona-content-input" rows="3"
          placeholder="描述这个 AI 角色的人设、风格、任务…"
          onchange="Settings._updatePersonaContent(${i},this.value)"
        >${App.escapeHtml(p.content)}</textarea>
      </div>
    `).join('');
  },

  addPersona() {
    const personas = this._getPersonas();
    personas.push({ name: '新人设 ' + (personas.length + 1), content: '', active: false });
    this._savePersonas(personas);
    this.renderPersonaList();
  },

  _activatePersona(index) {
    const personas = this._getPersonas();
    personas.forEach((p, i) => { p.active = (i === index); });
    this._savePersonas(personas);
    this._applyActivePersona();
    this.renderPersonaList();
    App.showToast('人设已激活');
  },

  _updatePersonaName(index, value) {
    const personas = this._getPersonas();
    if (personas[index]) {
      personas[index].name = value;
      this._savePersonas(personas);
    }
  },

  _updatePersonaContent(index, value) {
    const personas = this._getPersonas();
    if (personas[index]) {
      personas[index].content = value;
      this._savePersonas(personas);
      if (personas[index].active) this._applyActivePersona();
    }
  },

  _deletePersona(index) {
    const personas = this._getPersonas();
    personas.splice(index, 1);
    this._savePersonas(personas);
    this.renderPersonaList();
  },

  // ═══════════════════════════════════════
  // 字体系统（三槽制 + 方案管理 + 字体库）
  // ═══════════════════════════════════════

  // ── 渲染入口 ──
  renderFontSettings() {
    this._renderFontSchemeRow();
    this._renderFontSelects();
  },

  // ── 已保存方案横排（含内置默认） ──
  _renderFontSchemeRow() {
    const row = document.getElementById('font-scheme-row');
    if (!row) return;
    this._schemeList = [FONT_DEFAULT_SCHEME, ...(fontSettings.savedSchemes || [])];
    row.innerHTML = this._schemeList.map((s, i) => {
      const isActive = (fontSettings.activeSchemeId || 'scheme_default') === s.id;
      const delBtn = s.isBuiltin ? '' :
        `<button class="fsc-del" onclick="event.stopPropagation();Settings._confirmDeleteFontSchemeByIndex(${i})">×</button>`;
      return `<div class="font-scheme-chip ${isActive?'active':''}" onclick="Settings._applyFontSchemeByIndex(${i})">${App.escapeHtml(s.label)}${delBtn}</div>`;
    }).join('');
  },


  // ── 三槽 select 渲染 ──
  _renderFontSelects() {
    const allFonts = [...FONT_PRESETS, ...fontSettings.customFonts];
    const opts = allFonts.map(f =>
      `<option value="${f.id}">${App.escapeHtml(f.label)}</option>`
    ).join('');
    [
      ['font-sel-title', 'slotTitle'],
      ['font-sel-body',  'slotBody'],
      ['font-sel-ui',    'slotUi'],
    ].forEach(([elId, key]) => {
      const sel = document.getElementById(elId);
      if (!sel) return;
      sel.innerHTML = opts;
      sel.value = fontSettings[key] || 'default';
    });
  },

  // ── 槽位选择回调 ──
  onFontSelect(slotKey, fontId) {
    fontSettings[slotKey] = fontId === 'default' ? null : fontId;
    fontSettings.activeSchemeId = null;
    saveFontSettings();
    applyFontSettings();
    this._renderFontSchemeRow();
  },


  // ── 方案索引快捷调用 ──
  _applyFontSchemeByIndex(i) {
    const s = this._schemeList[i]; if (!s) return;
    this._applyFontScheme(s.id);
  },
  _confirmDeleteFontSchemeByIndex(i) {
    const s = this._schemeList[i]; if (!s) return;
    this._confirmDeleteFontScheme(s.id, s.label);
  },

  // ── 方案应用 ──
  _applyFontScheme(id) {
    const s = id === 'scheme_default'
      ? FONT_DEFAULT_SCHEME
      : (fontSettings.savedSchemes || []).find(x => x.id === id);
    if (!s) return;
    fontSettings.slotTitle = s.slotTitle;
    fontSettings.slotBody  = s.slotBody;
    fontSettings.slotUi    = s.slotUi;
    fontSettings.activeSchemeId = id;
    saveFontSettings();
    applyFontSettings();
    this.renderFontSettings();
  },

  // ── 保存当前方案（打开命名弹窗） ──
  openSaveFontScheme() {
    const input = document.getElementById('font-scheme-name-input');
    if (input) input.value = '';
    const overlay = document.getElementById('font-scheme-name-overlay');
    if (overlay) overlay.classList.add('open');
    setTimeout(() => { if (input) input.focus(); }, 100);
  },
  closeSaveFontScheme() {
    const overlay = document.getElementById('font-scheme-name-overlay');
    if (overlay) overlay.classList.remove('open');
  },
  confirmSaveFontScheme() {
    const input = document.getElementById('font-scheme-name-input');
    const name = input?.value.trim();
    if (!name) { if (input) input.focus(); return; }
    const scheme = {
      id: 'fs_' + Date.now(),
      label: name,
      isBuiltin: false,
      slotTitle: fontSettings.slotTitle,
      slotBody:  fontSettings.slotBody,
      slotUi:    fontSettings.slotUi,
    };
    if (!fontSettings.savedSchemes) fontSettings.savedSchemes = [];
    fontSettings.savedSchemes.push(scheme);
    fontSettings.activeSchemeId = scheme.id;
    saveFontSettings();
    this.closeSaveFontScheme();
    this.renderFontSettings();
    App.showToast(`方案「${name}」已保存`);
  },

  // ── 方案删除（使用确认弹窗） ──
  _delFontSchemeId: null,
  _confirmDeleteFontScheme(id, label) {
    this._delFontSchemeId = id;
    if (confirm(`删除方案「${label}」？\n字体方案将永久删除，此操作无法撤销。`)) {
      this._execDeleteFontScheme();
    }
  },
  _execDeleteFontScheme() {
    if (!this._delFontSchemeId) return;
    fontSettings.savedSchemes = (fontSettings.savedSchemes || []).filter(x => x.id !== this._delFontSchemeId);
    if (fontSettings.activeSchemeId === this._delFontSchemeId) fontSettings.activeSchemeId = 'scheme_default';
    saveFontSettings();
    this.renderFontSettings();
    App.showToast('方案已删除');
    this._delFontSchemeId = null;
  },

  // ── 字体库弹层 ──
  openFontLibrary() {
    this._renderFontLibList();
    const overlay = document.getElementById('font-lib-overlay');
    if (overlay) overlay.classList.add('open');
  },
  closeFontLibrary() {
    const overlay = document.getElementById('font-lib-overlay');
    if (overlay) overlay.classList.remove('open');
  },
  _renderFontLibList() {
    const el = document.getElementById('font-lib-list');
    if (!el) return;
    const custom = fontSettings.customFonts || [];
    if (!custom.length) {
      el.innerHTML = '<div style="font-size:0.75rem;color:var(--ink-ghost);padding:8px 0 4px;">暂无自定义字体，在下方添加</div>';
      return;
    }
    el.innerHTML = custom.map(f => `
      <div class="font-lib-item">
        <div class="font-lib-item-info">
          <span class="font-lib-item-name" style="font-family:${f.title||f.ui}">${App.escapeHtml(f.label)}</span>
          <span class="font-lib-item-url">${App.escapeHtml(f.url)}</span>
        </div>
        <button class="font-lib-item-del" onclick="Settings.deleteCustomFont('${f.id}')">删除</button>
      </div>`).join('');
  },

  // ── 添加自定义字体 ──
  addCustomFont() {
    const inputEl = document.getElementById('font-url-input');
    const nameEl  = document.getElementById('font-name-input');
    const raw     = inputEl?.value.trim();
    if (!raw) { App.showToast('请填写字体 CSS 代码或链接'); return; }

    let cssUrl = null;
    let family = nameEl?.value.trim() || null;

    // 格式1：@import url("...")
    const importMatch = raw.match(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/);
    if (importMatch) cssUrl = importMatch[1].trim();

    // 格式2：font-family: "FontName"
    if (!family) {
      const ffMatch = raw.match(/font-family\s*:\s*["']?([^"';\r\n]+)["']?/);
      if (ffMatch) family = ffMatch[1].trim().replace(/;$/, '');
    }

    // 格式3：纯 URL
    if (!cssUrl && (raw.startsWith('http') || raw.startsWith('//'))) {
      cssUrl = raw.split(/\s/)[0];
    }

    // 从 Google Fonts URL 推断 family
    if (!family && cssUrl) {
      const gfMatch = cssUrl.match(/family=([^&:]+)/);
      if (gfMatch) family = decodeURIComponent(gfMatch[1].replace(/\+/g, ' '));
    }

    if (!cssUrl)  { App.showToast('未能识别有效的 CSS 链接，请检查格式'); return; }
    if (!family)  { App.showToast('请填写字体名称'); if (nameEl) nameEl.focus(); return; }

    const fontValue = `'${family}',sans-serif`;
    const id = 'cf_' + Date.now();
    const label = nameEl?.value.trim() || family;
    const newFont = { id, label, url: cssUrl, ui: fontValue, body: fontValue, title: fontValue };
    if (!fontSettings.customFonts) fontSettings.customFonts = [];
    fontSettings.customFonts.push(newFont);
    saveFontSettings();
    loadFontUrl(cssUrl);
    if (inputEl) inputEl.value = '';
    if (nameEl)  nameEl.value = '';
    this._renderFontLibList();
    this._renderFontSelects();
    App.showToast(`字体「${label}」已添加`);
  },

  // ── 删除自定义字体 ──
  deleteCustomFont(id) {
    fontSettings.customFonts = (fontSettings.customFonts || []).filter(f => f.id !== id);
    // 若某槽正在用此字体，重置为默认
    ['slotTitle','slotBody','slotUi'].forEach(k => {
      if (fontSettings[k] === id) fontSettings[k] = null;
    });
    saveFontSettings();
    applyFontSettings();
    this._renderFontLibList();
    this._renderFontSelects();
    App.showToast('字体已删除');
  },


  // ─── 配色方案 ───
  _getColorSchemes() {
    return JSON.parse(localStorage.getItem('color-schemes') || '[]');
  },

  _saveColorSchemes(schemes) {
    localStorage.setItem('color-schemes', JSON.stringify(schemes));
  },

  // vars: { bg, ink, inkMid, inkFaint, inkGhost, rule }
  // 接受完整的 6 变量对象，直接 setProperty，不做颜色格式推算。
  // inkMid/inkFaint/inkGhost 为空时移除 inline 值，回退到 base.css 默认值。
  applyColorPreset(vars) {
    const root = document.documentElement;
    root.style.setProperty('--bg',   vars.bg);
    root.style.setProperty('--ink',  vars.ink);
    root.style.setProperty('--rule', vars.rule);
    if (vars.inkMid)   root.style.setProperty('--ink-mid',   vars.inkMid);
    else               root.style.removeProperty('--ink-mid');
    if (vars.inkFaint) root.style.setProperty('--ink-faint', vars.inkFaint);
    else               root.style.removeProperty('--ink-faint');
    if (vars.inkGhost) root.style.setProperty('--ink-ghost', vars.inkGhost);
    else               root.style.removeProperty('--ink-ghost');
    App.showToast('配色已应用');
    // 软性联动：全局配色变更时清除阅读器的配色 override，使阅读器跟随全局
    if (typeof Reader !== 'undefined') Reader.clearReadColorOverride();
  },

  randomColorScheme() {
    // 基于 HSL 精确算法，直接计算全 6 个变量，避免 alpha 推算
    const hue     = Math.floor(Math.random() * 360);
    const compHue = (hue + 180) % 360;
    const bgL     = 88 + Math.random() * 8;   // 背景亮度 88-96%
    const inkL    = 10 + Math.random() * 15;  // 墨色亮度 10-25%
    const bgS     = 15 + Math.random() * 20;  // 背景饱和度 15-35%
    const inkS    = 20 + Math.random() * 30;  // 墨色饱和度 20-50%

    const vars = {
      bg:       `hsl(${hue},${bgS.toFixed(1)}%,${bgL.toFixed(1)}%)`,
      ink:      `hsl(${compHue},${inkS.toFixed(1)}%,${inkL.toFixed(1)}%)`,
      inkMid:   `hsl(${compHue},${(inkS*0.7).toFixed(1)}%,${(inkL+28).toFixed(1)}%)`,
      inkFaint: `hsl(${compHue},${(inkS*0.4).toFixed(1)}%,${(inkL+52).toFixed(1)}%)`,
      inkGhost: `hsl(${compHue},${(inkS*0.2).toFixed(1)}%,${(inkL+66).toFixed(1)}%)`,
      rule:     `hsl(${hue},${(bgS*0.6).toFixed(1)}%,${(bgL-12).toFixed(1)}%)`
    };
    this.applyColorPreset(vars);
    App.showToast('随机配色已应用，点击「保存」留存');
  },

  saveColorScheme() {
    // 保存当前全部 6 个 CSS 变量，确保恢复时完整
    const root = document.documentElement;
    const cs   = getComputedStyle(root);
    // 优先从 inline style 取（applyColorPreset 设置的），保证取到用户最新配色
    const get = (v) => root.style.getPropertyValue(v).trim()
                    || cs.getPropertyValue(v).trim();
    const bg       = get('--bg');
    const ink      = get('--ink');
    const inkMid   = get('--ink-mid');
    const inkFaint = get('--ink-faint');
    const inkGhost = get('--ink-ghost');
    const rule     = get('--rule');
    const name = prompt('为这个配色方案命名：', '自定义配色');
    if (!name) return;

    const schemes = this._getColorSchemes();
    schemes.push({ name, bg, ink, inkMid, inkFaint, inkGhost, rule, active: false });
    this._saveColorSchemes(schemes);
    this.renderColorSchemeList();
    // 防御判断：阅读器排版面板可能未打开，Reader 对象始终存在但需保持与其他地方一致的写法
    if (typeof Reader !== 'undefined') Reader.renderTypoColorChips();
    App.showToast(`配色「${name}」已保存`);
  },

  renderColorSchemeList() {
    const userSchemes = this._getColorSchemes();
    const container = document.getElementById('color-scheme-list');
    if (!container) return;

    // 内置配色芯片（不可删除，始终显示在前）
    const builtinHtml = COLOR_PRESETS.map((p, i) => {
      const isActive = (this._activeBuiltinColorIdx === i && !userSchemes.some(s => s.active))
                     ? ' active' : '';
      return `<div class="sp-color-chip${isActive}"
        style="background:${p.bg};"
        title="${App.escapeHtml(p.name)}"
        onclick="Settings._activateBuiltinColor(${i})">
      </div>`;
    }).join('');

    // 用户保存的配色芯片（可删除）
    const userHtml = userSchemes.map((s, i) => `
      <div class="sp-color-chip${s.active ? ' active' : ''}"
        style="background:${s.bg};"
        title="${App.escapeHtml(s.name)}"
        onclick="Settings._activateColorScheme(${i})">
        <span class="chip-del" onclick="event.stopPropagation();Settings._deleteColorScheme(${i})">✕</span>
      </div>
    `).join('');

    container.innerHTML = builtinHtml + userHtml;
  },

  _activateBuiltinColor(index) {
    // 记录激活的内置配色索引，清除用户方案激活态
    this._activeBuiltinColorIdx = index;
    const userSchemes = this._getColorSchemes();
    userSchemes.forEach(s => { s.active = false; });
    this._saveColorSchemes(userSchemes);
    this.applyColorPreset(COLOR_PRESETS[index]);
    this.renderColorSchemeList();
    if (typeof Reader !== 'undefined') Reader.renderTypoColorChips();
  },

  _activateColorScheme(index) {
    // 用户方案激活，清除内置激活索引
    this._activeBuiltinColorIdx = -1;
    const schemes = this._getColorSchemes();
    schemes.forEach((s, i) => { s.active = (i === index); });
    this._saveColorSchemes(schemes);
    const s = schemes[index];
    // 兼容旧版（只有 bg/ink/rule 3 字段）的保存数据
    const vars = {
      bg:       s.bg,
      ink:      s.ink,
      inkMid:   s.inkMid   || '',
      inkFaint: s.inkFaint || '',
      inkGhost: s.inkGhost || '',
      rule:     s.rule
    };
    this.applyColorPreset(vars);
    this.renderColorSchemeList();
    if (typeof Reader !== 'undefined') Reader.renderTypoColorChips();
  },

  _deleteColorScheme(index) {
    const schemes = this._getColorSchemes();
    schemes.splice(index, 1);
    this._saveColorSchemes(schemes);
    this.renderColorSchemeList();
    if (typeof Reader !== 'undefined') Reader.renderTypoColorChips();
  },

  // ─── 数据导出 ───
  async exportData() {
    const books = await Store.getAll('books');
    const notes = await Store.getAll('notes');
    
    // 导出时不含书籍内容（太大），只含元数据和笔记
    const exportBooks = books.map(b => ({
      ...b,
      content: undefined,   // 不导出正文
      pdfPages: undefined   // 不导出 PDF 图像
    }));

    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      books: exportBooks,
      notes
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `soulreader-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    App.showToast('已导出');
  },

  // ─── 封面风格 ───
  loadCoverStyle() {
    const style = localStorage.getItem('sr_cover_style') || 'c';
    document.documentElement.dataset.coverStyle = style;
    this._coverStyle = style;
    this.renderCoverStyleUI();
  },

  renderCoverStyleUI() {
    const container = document.getElementById('cover-style-options');
    if (!container) return;
    ['a', 'b', 'c'].forEach(s => {
      const el = container.querySelector(`[data-style="${s}"]`);
      if (el) el.classList.toggle('active', this._coverStyle === s);
    });
  },

  // ─── 显示原书封面开关 ───
  loadCoverImageToggle() {
    // 默认开启（首次使用即展示封面图）
    const enabled = localStorage.getItem('sr_show_cover_image') !== 'false';
    this._showCoverImage = enabled;
    this._renderCoverImageToggleUI();
  },

  _renderCoverImageToggleUI() {
    const btn = document.getElementById('cover-image-toggle');
    if (!btn) return;
    if (this._showCoverImage) {
      btn.textContent = '已开启';
      btn.classList.add('active');
    } else {
      btn.textContent = '已关闭';
      btn.classList.remove('active');
    }
  },

  toggleCoverImage() {
    this._showCoverImage = !this._showCoverImage;
    localStorage.setItem('sr_show_cover_image', this._showCoverImage ? 'true' : 'false');
    this._renderCoverImageToggleUI();
    App.renderShelf(); // 立即刷新书架
  },

  // ─── 数据导入 ───
  async importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // 基本结构校验：防止损坏的 JSON 写入数据库
      if (typeof data !== 'object' || data === null) {
        throw new Error('文件格式无效');
      }

      if (data.books) {
        if (!Array.isArray(data.books)) throw new Error('books 字段格式错误');
        for (const book of data.books) {
          // 必要字段校验：id 和 title 缺一不可
          if (!book || typeof book !== 'object') continue;
          if (!book.id || !book.title) {
            App.log('warn', 'Settings', `跳过无效书籍记录（缺少 id 或 title）`);
            continue;
          }
          await Store.put('books', book);
        }
      }
      if (data.notes) {
        if (!Array.isArray(data.notes)) throw new Error('notes 字段格式错误');
        for (const note of data.notes) {
          // 必要字段校验：id 和 bookId 缺一不可
          if (!note || typeof note !== 'object') continue;
          if (!note.id || !note.bookId) {
            App.log('warn', 'Settings', `跳过无效笔记记录（缺少 id 或 bookId）`);
            continue;
          }
          await Store.put('notes', note);
        }
      }

      App.showToast('导入成功，正在刷新…');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      App.showToast('导入失败：' + e.message);
    }
  },

  // ─── 检查更新（强制网络拉取最新 SW，有新版则自动激活并刷新） ───
  //
  // 工作原理：
  //   sw.js 在 install 时调用 skipWaiting()，新 SW 安装完成后立即激活，
  //   触发 navigator.serviceWorker 的 controllerchange 事件，页面随即刷新。
  //   reg.update() 触发网络拉取 sw.js；若文件有变化则启动安装流程；
  //   若无变化（字节相同）则不产生新 SW，controllerchange 不触发。
  //   通过 reg 的 updatefound 事件判断是否真的有新版本，避免误报。
  //
  async checkUpdate() {
    const btn = document.getElementById('update-btn');
    const status = document.getElementById('update-status');
    const ver = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '';

    if (!('serviceWorker' in navigator)) {
      if (status) status.textContent = '当前环境不支持 Service Worker';
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = '检查中…'; }
    if (status) status.textContent = '正在检查更新…';

    // 防止多次点击重复注册 controllerchange
    if (this._ccHandler) {
      navigator.serviceWorker.removeEventListener('controllerchange', this._ccHandler);
      this._ccHandler = null;
    }

    const cleanup = () => {
      if (this._ccHandler) {
        navigator.serviceWorker.removeEventListener('controllerchange', this._ccHandler);
        this._ccHandler = null;
      }
      if (this._updateFoundHandler && this._swReg) {
        this._swReg.removeEventListener('updatefound', this._updateFoundHandler);
        this._updateFoundHandler = null;
        this._swReg = null;
      }
    };

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (status) status.textContent = '未找到 Service Worker 注册';
        if (btn) { btn.disabled = false; btn.textContent = '检查'; }
        return;
      }

      // 标记是否检测到新版本（updatefound 触发时置 true）
      let updateFound = false;

      // updatefound：reg.update() 发现 sw.js 有变化，新 SW 开始安装
      this._swReg = reg;
      this._updateFoundHandler = () => {
        updateFound = true;
        if (status) status.textContent = '发现新版本，正在安装…';
      };
      reg.addEventListener('updatefound', this._updateFoundHandler, { once: true });

      // controllerchange：新 SW 激活并接管页面，立即刷新
      this._ccHandler = () => { window.location.reload(); };
      navigator.serviceWorker.addEventListener('controllerchange', this._ccHandler, { once: true });

      // 触发网络检查（拉取最新 sw.js）
      await reg.update();

      // reg.update() resolve 后等待一段时间：
      //   - 若有新版：updatefound 已触发，新 SW 正在安装，安装完自动 skipWaiting → controllerchange → reload
      //   - 若无新版：updatefound 未触发，超时后显示"已是最新"
      // 等待时间：最长 8s（网络慢时给足够时间安装）
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!updateFound) {
        // 0.5s 内 updatefound 未触发 → 无新版本
        cleanup();
        if (status) status.innerHTML = ver ? `✓ 已是最新版本（${ver}）` : '✓ 已是最新版本';
        if (btn) { btn.disabled = false; btn.textContent = '检查'; }
      }
      // 若 updateFound = true，等待 controllerchange 触发 reload；
      // 兜底：8s 后强制刷新（防止 controllerchange 因某种原因未触发）
      if (updateFound) {
        setTimeout(() => { cleanup(); window.location.reload(); }, 8000);
      }

    } catch (e) {
      cleanup();
      if (status) status.textContent = '检查失败：' + e.message;
      if (btn) { btn.disabled = false; btn.textContent = '检查'; }
    }
  }
};

// 全局封面风格切换函数（供 HTML onclick 调用）
function setCoverStyle(style) {
  localStorage.setItem('sr_cover_style', style);
  document.documentElement.dataset.coverStyle = style;
  Settings._coverStyle = style;
  Settings.renderCoverStyleUI();
  App.renderShelf(); // 切换后立即重新渲染书架，无需刷新页面
}
