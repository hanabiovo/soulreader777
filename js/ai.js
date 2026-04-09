/* ═══════════════════════════════════════
   AI.JS - API 调用、流式输出、上下文管理
   ═══════════════════════════════════════ */

const AI = {
  // API 配置
  config: {
    apiKey: '',
    apiUrl: '',
    model: '',
    presets: []
  },

  // 初始化配置
  init() {
    const saved = localStorage.getItem('ai-config');
    if (saved) {
      this.config = JSON.parse(saved);
    }
  },

  // 保存配置
  saveConfig() {
    localStorage.setItem('ai-config', JSON.stringify(this.config));
  },

  // 流式调用 API
  async callStream(messages, onChunk, onDone, onError) {
    try {
      // 自动补全 /chat/completions 后缀：
      // 用户可能填 https://api.openai.com/v1 也可能填完整路径
      let apiUrl = (this.config.apiUrl || '').trim().replace(/\/+$/, '');
      if (!apiUrl) {
        throw new Error('未配置 API URL，请前往设置页填写');
      }
      if (!apiUrl.endsWith('/chat/completions')) {
        apiUrl = apiUrl + '/chat/completions';
      }

      App.log('info', 'AI', `callStream → ${this.config.model} (${messages.length} messages)`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          stream: true
        })
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const err = new Error(`API 错误: ${response.status}`);
        App.log('error', 'AI', `HTTP ${response.status} — ${body.slice(0, 200)}`, err);
        throw err;
      }

      App.log('info', 'AI', `stream 连接成功 (HTTP ${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) onChunk(content);
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      App.log('info', 'AI', 'stream 完成');
      onDone();
    } catch (error) {
      App.log('error', 'AI', 'callStream 失败: ' + error.message, error);
      onError(error);
    }
  },

  // 构建上下文（历史截断 + 段落上下文注入 + 记忆注入）
  buildContext(messages, bookContext = '', readingContext = '', memories = []) {
    // 只取最近 10 轮对话（10轮 = user+assistant 各10条，共20条）
    // 过滤掉 system 消息后取最近 20 条
    const historyMessages = messages.filter(m => m.role !== 'system');
    const recentMessages = historyMessages.slice(-20);

    // 构建 system prompt：优先使用用户自定义人设，否则用默认提示词
    let systemPrompt = (this.config.persona && this.config.persona.trim())
      ? this.config.persona.trim()
      : '你是一位专业的阅读助手，帮助用户深入理解书中内容。';

    // 注入书籍记忆（上一轮对话提炼的要点）
    if (memories && memories.length > 0) {
      systemPrompt += `\n\n【关于这本书的已知记忆】\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
    }

    // 注入书籍背景（书名、作者等元数据）
    if (bookContext) {
      systemPrompt += `\n\n【书籍信息】\n${bookContext}`;
    }

    // 注入当前阅读段落上下文（前后各 500 字）
    if (readingContext) {
      systemPrompt += `\n\n【当前阅读段落】\n${readingContext}`;
    }

    return [
      { role: 'system', content: systemPrompt },
      ...recentMessages
    ];
  },

  // 提炼记忆（Promise 包裹，确保流完成后再返回结果）
  async summarizeThread(messages) {
    const summaryMessages = [
      { role: 'system', content: '请将以下对话提炼为一条简洁的记忆要点（50字以内）' },
      { role: 'user', content: JSON.stringify(messages) }
    ];

    return new Promise((resolve, reject) => {
      let summary = '';
      this.callStream(
        summaryMessages,
        (chunk) => { summary += chunk; },
        () => { resolve(summary.trim()); },
        (error) => {
          console.error('提炼记忆失败:', error);
          reject(error);
        }
      );
    });
  }
};
