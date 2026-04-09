# 项目进度报告

---

## 🔍 代码审查报告（2026-04-09）

### 一、已修复的 Bug 清单

| # | 文件 | 问题描述 | 修复方式 |
|---|------|----------|----------|
| 1 | `app.js` | `renderListView` 中 `book.content` 可能为 undefined（PDF 无正文字段），导致 `.length` 报错 | 改用 `(book.content \|\| '').length` 兼容处理 |
| 2 | `app.js` | `renderListView` 中 `book.format.toUpperCase()` 可能报错，旧数据只有 `type` 字段 | 改为 `(book.format \|\| book.type \|\| '?').toUpperCase()` |
| 3 | `app.js` | `importFile` 导入时只存 `format`，未存旧字段名 `type`，导致与旧数据不兼容 | 同时写 `format` 和 `type` 两个字段 |
| 4 | `reader.js` | `renderContent(content)` 接收到 `undefined` 时 `.split()` 报错 | 增加空值守卫，显示提示文本 |
| 5 | `reader.js` | `restoreHighlights` 是空函数，打开书籍后高亮全部丢失 | 实现基于 TreeWalker 文本节点匹配的高亮恢复逻辑 |
| 6 | `reader.js` | `setTypoParam(param, value, null)` 时 `btn.closest(...)` 报空指针 | 增加 `if (btn)` 守卫，滑块拖动不再崩溃 |
| 7 | `parser.js` | TXT 解析直接用 `file.text()`，固定 UTF-8，无法处理 GBK 中文旧文件 | 改为读 `localStorage['sr_encoding']`，用 `TextDecoder(encoding)` 解码 |
| 8 | `notes.js` | `openNote` 未检查书籍是否存在就直接 `Reader.open()`，找不到书时无提示 | 先 `Store.get(books, note.bookId)` 验证，失败则 toast 提示 |
| 9 | `notes.js` | 笔记列表无删除功能（原版有长按删除） | 新增 `deleteNote(noteId)` 方法 |
| 10 | `ai.js` | `callStream` 直接用用户填写的 URL 发请求，若用户填 base URL（不含路径）则 404 | 自动检测并补全 `/chat/completions` 后缀 |
| 11 | `ai.js` | 未填写 API URL 时报网络错误，无友好提示 | 增加空值检测，抛出「未配置 API URL」提示 |
| 12 | `settings.js` | `applyColorPreset` 对非 hex 颜色（hsl/rgb）拼接 `aa` 生成无效 CSS 值 | 先判断是否为 6 位 hex，非 hex 颜色时移除相关变量改用默认值 |


## ✅ P0 阶段完成

### 已完成的工作

1. **目录结构建立**
   - ✅ 创建 `css/` 目录（7个CSS文件）
   - ✅ 创建 `js/` 目录（7个JS文件）
   - ✅ 创建 `icons/` 目录（占位图标）

2. **CSS 文件（7个）**
   - ✅ [`base.css`](css/base.css:1) - CSS变量、Reset、字体引入
   - ✅ [`layout.css`](css/layout.css:1) - 底部导航、视图切换、通用动画
   - ✅ [`shelf.css`](css/shelf.css:1) - 书架页样式
   - ✅ [`reader.css`](css/reader.css:1) - 阅读界面、选词dock、进度条
   - ✅ [`sidebar.css`](css/sidebar.css:1) - AI聊天侧边栏
   - ✅ [`notes.css`](css/notes.css:1) - 笔记本页
   - ✅ [`settings.css`](css/settings.css:1) - 设置面板

3. **JavaScript 文件（7个）**
   - ✅ [`store.js`](js/store.js:1) - IndexedDB 封装
   - ✅ [`parser.js`](js/parser.js:1) - EPUB/PDF/TXT 解析
   - ✅ [`ai.js`](js/ai.js:1) - API调用、流式输出、上下文管理
   - ✅ [`reader.js`](js/reader.js:1) - 阅读、划词、进度记忆
   - ✅ [`notes.js`](js/notes.js:1) - 笔记本逻辑
   - ✅ [`settings.js`](js/settings.js:1) - 设置面板、主题、字体、排版方案
   - ✅ [`app.js`](js/app.js:1) - 应用入口、tab切换、全局初始化

4. **核心文件**
   - ✅ [`index.html`](index.html:1) - 主页面（已集成所有模块）
   - ✅ [`manifest.json`](manifest.json:1) - PWA配置
   - ✅ [`sw.js`](sw.js:1) - Service Worker
   - ✅ [`README.md`](README.md:1) - 项目文档

### 设计语言实现

已按照「灵感之海」风格实现：

1. **CSS 变量体系** ✅
   - 颜色：`--bg`, `--ink`, `--ink-mid`, `--ink-faint`, `--ink-ghost`, `--rule`
   - 字体：`--font-ui`, `--font-body`, `--font-title`
   - 阅读排版：`--read-size`, `--read-line`, `--read-para`, `--read-px`

2. **暗色模式** ✅
   - 通过 `[data-theme="dark"]` 切换
   - 所有颜色变量自动适配

3. **极简设计** ✅
   - 去除毛玻璃、圆角卡片
   - 使用细线分隔（`border: 1px solid var(--rule)`）
   - 按钮改为文字触发区
   - 动画只有透明度和位移

### 功能模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 底部导航 | ✅ 已实现 | 3个tab：架·记·设 |
| 书架页 | ✅ 已实现 | 网格/列表视图切换、排序 |
| 阅读器 | ✅ 已实现 | 顶部header、正文区、进度条 |
| 选词dock | ✅ 已实现 | 底部弹出操作条 |
| AI侧边栏 | ✅ 已实现 | 右侧抽屉、线稿风格 |
| 笔记本 | ✅ 已实现 | 按书分组、自由笔记 |
| 设置面板 | ✅ 已实现 | 上滑面板、3个tab |
| 数据存储 | ✅ 已实现 | IndexedDB封装 |
| 文件解析 | ✅ 已实现 | EPUB/PDF/TXT支持 |
| AI集成 | ✅ 已实现 | 流式调用、上下文管理 |

## 🔍 功能差异分析（灵犀 vs 原版 SoulReader）

### 三、未实现 / 缺失的功能

| 功能 | 原版有 | 灵犀状态 | 优先级 |
|------|--------|----------|--------|
| **多 API 预设方案**（切换/另存/删除） | ✅ | ❌ 仅单套配置 | 高 |
| **「仅记录」按钮**（不发送 AI，只存笔记消息） | ✅ | ❌ 缺失 | 中 |
| **消息重试**（重新生成最后一条 AI 回复） | ✅ `retryAI()` | ❌ 缺失 | 中 |
| **消息编辑**（编辑用户消息） | ✅ `editMsg()` | ❌ 缺失 | 低 |
| **笔记列表删除入口**（长按或删除按钮） | ✅ 长按 Action Sheet | ⚠️ 仅新增了 deleteNote() 方法，UI 无入口 | 高 |
| **书籍背景/摘要编辑（本书大脑）** | ✅ 弹出 modal 可编辑+AI自动提取 | ❌ 完全缺失 | 高 |
| **AI 自动提取全书背景** | ✅ `autoAnalyze()` | ❌ 缺失 | 中 |
| **PDF canvas 分页渲染** | ❌（原版也是文字提取） | ❌ 待 PX 阶段 | 高（PX） |
| **GBK 编码选择 UI** | ✅ 设置页 select | ❌ 只有存储逻辑，无 UI 入口 | 中 |
| **旧数据找回 UI**（切换 DB 名称） | ✅ 设置页输入框 | ❌ 只有 Store.switchDB() 方法，无 UI | 中 |
| **目录正则提取章节**（原版按第X章等识别） | ✅ 正则提取 | ⚠️ 现版仅扫描 h1/h2/h3，TXT无标题则无目录 | 中 |

### 四、功能实现不完整（有骨架但缺细节）

| 功能 | 问题描述 |
|------|----------|
| **底部导航 Tab 文字** | 需求文档要求「架 · 记 · 设」汉字，当前用 Font Awesome 图标（fa-book-open 等），不符合设计语言 |
| **书架删除按钮** | 列表视图有「删」按钮，但网格视图无删除入口（原版网格有 × 角标） |
| **选词 dock 触发时机** | `selectionchange` 监听延迟 200ms，但 iOS 上 selectionchange 行为特殊，可能漏触发 |
| **排版「更多设置」链接** | `goToTypographySettings()` 已实现但 HTML 中无对应「更多设置 →」入口 |
| **settings.js switchTab 初始化** | `app.js` 的 `switchTab('settings')` 时调用 `Settings.switchTab('ai')`，但第一次切换 settings tab 时 AI 配置字段已在 `init()` 中加载，会重复赋值 |
| **「字」面板 backdrop 点击** | `#typography-backdrop` 没有背景色（`display:none → block` 无色），点击空白区域可以关闭面板，但视觉上用户感知不到遮罩层存在 |
| **AI 侧边栏「仅记录」** | 原版在输入框旁有「仅记录」和「发送给AI」两个按钮，灵犀只有一个「发送」，缺少纯文本记录功能 |
| **笔记本页切换时才渲染** | `switchTab('notes')` 时调用 `Notes.render()`，关闭阅读器后不自动刷新笔记列表，需用户手动切换 tab |
| **自由笔记只用 localStorage** | `free-note` 存在 localStorage，未存 IndexedDB，导出备份时丢失 |
| **书籍进度百分比算法** | 列表视图进度 = `scrollPosition / content.length`，这是字符位置而非像素滚动，精度低 |

### 五、设计语言改动（与需求文档对比）

| 改动点 | 需求文档要求 | 当前实现 |
|--------|-------------|----------|
| Tab 文字 | 汉字「架 · 记 · 设」，`--font-title` | Font Awesome 图标 |
| 目录面板 | 侧边抽屉（从左滑出），跳转后关闭 | 全屏覆盖层 |
| Toast 样式 | 极简线稿，无背景 | 有 border，白底，已接近 |
| `typography-backdrop` | 约 240px 高面板 | 最高 72vh，可接受 |

## ✅ 智能目录 & 本书大脑（2026-04-09）

### 智能目录（任务一）

**改动文件**：`js/reader.js`、`css/reader.css`

- 重写 `showTOC()`：在扫描 `h1/h2/h3` 的基础上，新增对 `<p>` 标签的正则匹配
- 识别模式：
  - `第[零一二三四五六七八九十百千万0-9]+[章回节卷部].{0,30}`
  - `Chapter\s*\d+.*`
  - `引子|番外|前言|序言|尾声|后记`
- 匹配到的 `<p>` 节点动态注入 `id`（`toc-0`, `toc-1`...），点击后平滑滚动
- 按 DOM 顺序排序（`compareDocumentPosition`），避免 h 与 p 交叉乱序
- 目录为空时显示友好提示文字（`.toc-empty` 样式）
- 新增 `scrollToTocEntry()` 替代旧 `scrollToHeading()`，通过缓存引用直接定位

### 本书大脑（任务二）

**改动文件**：`js/reader.js`、`index.html`、`css/reader.css`

- 阅读器 header「记忆」按钮 → 触发底部上滑面板（参考「字」排版面板交互）
- **书籍背景区**：`textarea` 读写 `book.context`，失焦自动保存 IndexedDB
- **AI 自动提取**：取 `book.content` 前 2500 字 + 书名，调用 `AI.callStream` 流式写入背景框
- **记忆卡片列表**：渲染 `book.memories[]`，每条 `contenteditable` 可编辑，`onblur` 保存，有 `×` 删除入口
- **手动添加按钮**：push 空字符串并聚焦最后一张卡片
- 关闭阅读器时自动关闭记忆面板
- `ai.js` 的 `buildContext` 已确认正确注入 `book.memories` 和 `book.context` 到 system prompt

## ✅ 智能目录修复 & 统一调试日志（2026-04-09）

### 智能目录修复（任务一）

**改动文件**：[`js/reader.js`](js/reader.js:134)

- 新增第 4 条正则 `^[一二三四五六七八九十百千万]+[\s\u3000].{1,25}$`，覆盖「一　矿边物语」格式
- 目录页去重算法：扫描所有 `<p>` 标记命中状态，连续 5+ 个命中的段落视为目录页区间，整段跳过
- 算法流程：`matchFlags[]` → 检测连续命中 streak → `tocPageSet` → 过滤后生成条目

### 统一调试日志（任务二）

**改动文件**：[`js/app.js`](js/app.js:15)、[`css/base.css`](css/base.css:72)、[`index.html`](index.html:384)、[`js/ai.js`](js/ai.js:28)、[`js/settings.js`](js/settings.js:301)、[`js/reader.js`](js/reader.js:306)、[`js/store.js`](js/store.js:10)

- **核心方法** [`App.log(level, module, message, error)`](js/app.js:15)：始终输出 console，写入 `_logBuffer`（上限 50 条），debug 模式追加 DOM
- **调试面板**：URL 含 `?debug=1` 时右下角显示悬浮日志面板，支持折叠/展开、清空
- **CSS 样式**：[`#debug-panel`](css/base.css:72) 固定定位，monospace 字体，error 红色 / warn 橙色 / info 灰色
- **接入位置**：
  - [`AI.callStream`](js/ai.js:28)：记录请求发起、HTTP 状态码（含响应体前 200 字）、stream 完成/失败
  - [`Settings.importFont`](js/settings.js:301)：记录导入 URL、CSS 加载失败
  - [`Settings._parseFontFamilyFromSheets`](js/settings.js:323)：记录解析方法（cssRules / fetch / URL 参数）、解析结果、跨域/fetch 失败
  - [`Reader.autoExtractContext`](js/reader.js:306)：记录触发、完成、失败
  - [`Store`](js/store.js:10)：`init` 成功/失败、`getAll`/`get`/`put`/`delete`/`clear` 失败时记录（`init` 用 `typeof App !== 'undefined'` 守卫避免加载序问题）

## 🔄 下一步工作

### 当前优先修复项（建议）
1. **Tab 图标 → 汉字**：`index.html` 底部导航改为「架」「记」「设」文字
2. **笔记删除 UI**：笔记列表每条加「删」文字按钮
3. **网格书封删除角标**：`.book-cover` 右上角加 `×` 角标
4. **GBK 编码 UI**：设置数据 tab 加编码选择行

### P2-P6: 功能完善
- P2: 书架页交互优化
- P3: 阅读器功能测试
- P4: 笔记本功能测试
- P5: 设置面板完善
- P6: AI上下文优化

## 📝 注意事项

1. **图标文件**：当前使用 SVG 占位，建议替换为 PNG 格式
2. **测试**：需要在浏览器中测试所有功能
3. **兼容性**：需要测试移动端适配
4. **性能**：需要测试大文件解析性能

## 🚀 如何测试

1. 启动本地服务器（避免 CORS 问题）：
   ```bash
   python -m http.server 8000
   # 或
   npx serve
   ```

2. 访问 `http://localhost:8000`

3. 测试流程：
   - 导入一本书（TXT/PDF/EPUB）
   - 测试阅读、划词、笔记功能
   - 配置 AI 并测试对话
   - 测试设置面板各项功能
   - 测试数据导出/导入

---

**当前版本**: v1.0.0-alpha  
**完成度**: 80%（核心框架完成，需要功能测试和优化）
