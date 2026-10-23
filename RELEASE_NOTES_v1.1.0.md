# ToDoReminder v1.1.0

## ✨ 新增功能

### 1. AI 智能生成待办
- 在主界面点击「✨ AI 生成」，粘贴聊天记录、会议纪要或工作安排等自然语言文本。
- 调用大模型自动解析为结构化待办：标题、日期、时间、优先级、标签、重复周期。
- 解析结果先展示预览，支持逐项勾选、编辑标题/日期/时间/优先级，确认后再批量入库。

### 2. AI 接口设置
- 在「设置 → AI 智能生成」中配置：Base URL、API Key、模型名。
- 兼容 DeepSeek、Kimi、OpenAI 等 OpenAI 格式接口。
- 默认配置为 DeepSeek（`https://api.deepseek.com`、`deepseek-chat`）。

### 3. 本地资源兜底
- 移除对 Google Fonts / Material Symbols CDN 的依赖。
- 引入本地 `material-symbols-outlined.woff2` 字体，离线或无外网环境也能正常显示图标。

### 4. 任务管理增强
- 优化快速录入窗口交互与样式。
- 任务列表/日历视图相关 UI 调整。

## 🔒 安全说明

- **源码与安装包中均不包含任何 API Key**；API Key 由用户在本地设置中填写，保存在应用主进程可访问的本地 settings.json 中。
- API 请求仅在主进程发起，渲染进程（页面脚本）**只感知“是否已配置 API Key”这一布尔值**，无法读取真实 Key。
- 设置面板的 API Key 输入框使用 `type="password"` 隐藏显示。

## 📦 安装包

- 文件：`ToDoReminder Setup 1.1.0.exe`（约 73 MB）
- 运行环境：Windows 10/11 x64
- 升级建议：直接覆盖安装即可保留原有任务与设置数据。
