# SoulReader · 灵犀

> 极简阅读器，支持 EPUB/PDF/TXT，内置 AI 对话

## 特性

- 📚 支持 EPUB、PDF、TXT 格式
- 🤖 AI 对话助手，随时讨论阅读内容
- 📝 笔记系统，记录阅读心得
- 🎨 极简设计，灵感之海风格
- 🌓 明暗主题切换
- 📱 PWA 支持，可安装到桌面
- 💾 本地存储，数据完全私密

## 文件结构

```
/
├── index.html              # 主页面
├── manifest.json           # PWA 配置
├── sw.js                   # Service Worker
├── icons/                  # 应用图标
├── css/
│   ├── base.css           # CSS 变量、reset、字体
│   ├── layout.css         # 底部导航、视图切换
│   ├── shelf.css          # 书架页
│   ├── reader.css         # 阅读界面
│   ├── sidebar.css        # AI 聊天侧边栏
│   ├── notes.css          # 笔记本页
│   └── settings.css       # 设置面板
└── js/
    ├── store.js           # IndexedDB 封装
    ├── parser.js          # 文件解析
    ├── ai.js              # AI 调用
    ├── reader.js          # 阅读逻辑
    ├── notes.js           # 笔记逻辑
    ├── settings.js        # 设置逻辑
    └── app.js             # 应用入口
```

## 使用方法

1. 部署到 GitHub Pages 或任何静态服务器
2. 打开应用，点击「＋ 导入」添加书籍
3. 在设置中配置 AI API（可选）
4. 开始阅读！

## 设置 AI

进入「设置」→「AI 配置」：

1. 填写 API Key
2. 填写 API URL（如 `https://api.openai.com/v1/chat/completions`）
3. 选择模型（如 `gpt-4`）
4. 保存配置

## 开发

本项目使用原生 HTML/CSS/JS，无需构建工具。

直接用浏览器打开 `index.html` 即可开发调试。

## 许可

MIT License

---

**原作者**: SoulReader  
**改版**: 灵犀（基于灵感之海设计语言）
