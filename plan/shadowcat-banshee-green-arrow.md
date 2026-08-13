# ToDoReminder：AI 文本解析生成待办

目标：用户把一整段文字（聊天记录、会议纪要、工作安排等）粘进应用，调用大模型解析成结构化待办，**预览勾选确认后**批量入库。

技术选型（已确认）：
- 可配置的 OpenAI 兼容接口（Base URL + API Key + 模型名，兼容 DeepSeek/Kimi/Qwen/OpenAI）
- 解析结果先预览，可勾选/编辑，确认后入库
- HTTP 调用放在主进程（避开 CORS，API Key 不进渲染进程）

## 改动点

### 1. 设置持久化 — `main.js`
- `defaultSettings`（main.js:63）增加：
  ```js
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' }
  ```
- 注意：`loadSettings()` 直接返回 JSON 解析结果，老用户的 settings.json 没有 `ai` 字段 —— 读取时用 `{ ...defaultSettings, ...parsed }` 合并兜底（只改 loadSettings 一处）。

### 2. AI 解析模块 — 新建 `src/main/ai.js`
- `parseTextToTasks(text, aiConfig, today)`：
  - 用 Node 18+ 全局 `fetch` POST `{baseUrl}/chat/completions`，`Authorization: Bearer <apiKey>`
  - system prompt 里注入今天日期（`formatLocalDate()`），要求模型输出**纯 JSON 数组**，元素字段与现有任务模型对齐：
    `{ title, date(YYYY-MM-DD), time(HH:MM 或 null), priority('高/中/低'), tags[], repeat(null/'每天'/'每周'/'每月') }`
  - 请求体带 `response_format: { type: 'json_object' }`（不兼容的供应商回退为纯文本 + 提取 JSON）
  - 解析响应：容错提取 JSON（去 ```json 围栏）、逐条校验/清洗（缺 title 丢弃，非法 date/time 置 null，priority 归一化）
  - 超时 60s，错误时抛出可读中文错误（无 Key/网络失败/解析失败）
- 纯逻辑（prompt 构建 + JSON 容错提取 + 字段清洗）拆成可导出函数，便于 node 脚本自测

### 3. IPC — `main.js` + `preload.js`
- `ipcMain.handle('ai-parse-tasks', (e, text) => ...)`：读 settings.ai → 调 `parseTextToTasks` → 返回 `{ tasks }` 或 `{ error }`
- `ipcMain.handle('save-tasks', (e, newTasks) => ...)`：批量入库（合并 + 去重 id + `saveTasks` + `tasks-updated` 广播），比循环调单个 save-task 原子性更好
- preload 暴露：`aiParseTasks(text)`、`saveTasksBatch(tasks)`

### 4. 设置页 UI — `index.html` + `app.js`
- 设置视图（index.html:262 起）新增「AI 智能生成」卡片，沿用现有设置卡片样式：
  - Base URL、API Key（type=password）、模型名 三个输入框 + 一句提示（兼容 DeepSeek/Kimi/OpenAI 等 OpenAI 格式接口）
- `loadSettingsToUI()` / 保存设置逻辑（app.js:506）同步纳入这三个字段

### 5. AI 生成入口与预览弹窗 — `index.html` + `app.js` + `styles/main.css`
- 今日视图任务输入区旁加「AI 生成」按钮（✨ 图标）
- 点击打开模态框（复用 `showPickerModal` 的弹窗模式，app.js:327，但内容更复杂，写独立函数 `showAiGenerateModal()`）：
  1. 大 textarea（粘贴整段文字）+「开始解析」按钮
  2. 解析中显示 loading，按钮禁用；失败显示错误文案可重试
  3. 成功后列表预览：每条 = checkbox + 可编辑 title + 日期/时间/优先级/标签展示，默认全选
  4. 「导入 N 项」→ 过滤勾选项 → 补 `id/status:'待办'/createdAt`（对齐 quickInput.html:601 的任务结构）→ `saveTasksBatch` → 关闭弹窗并刷新列表
- 未配置 API Key 时弹窗内直接提示「请先在设置中配置 AI 接口」

## 不做的事
- 不动现有调度器、提醒弹窗、Obsidian 同步逻辑
- 不加供应商 SDK、不加流式输出、不做本地模型

## 验证
1. `node -e` 脚本直接调 `ai.js` 的容错提取/清洗函数，喂畸形 JSON 验证健壮性
2. `npm start` 启动应用，配置一个真实可用的 OpenAI 兼容 Key（或临时 mock 服务），走完整流程：粘贴 → 解析 → 预览勾选 → 导入 → 列表/提醒正常
3. 回归：手动加任务、保存设置、重启应用后设置仍在

## 安全说明
- API Key 明文存于本地 `settings.json`（与现有设置同目录），仅本机使用；key 不会传给渲染进程之外的地方
