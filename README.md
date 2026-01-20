# ToDoReminder

<p align="center">
  <img src="src/renderer/assets/logo.svg" width="80" height="80" alt="ToDoReminder Logo">
</p>

<p align="center">
  <strong>Windows 待办事项管理应用</strong><br>
  本地优先 · Obsidian 同步 · 极简设计
</p>

<p align="center">
  <a href="https://github.com/IsHexx/ToDoReminder/releases">
    <img src="https://img.shields.io/github/v/release/IsHexx/ToDoReminder?style=flat-square" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## ✨ 功能特性

### 📋 任务管理
- 创建、编辑、删除任务
- 优先级设置（高/中/低）
- 任务完成状态追踪（横线划掉效果）
- 任务延迟/重复设置

### 📅 多视图展示
- **今日视图** - 专注当天任务
- **即将到来** - 未来 7 天任务预览
- **日历视图** - 月度任务概览，彩色标签区分

### 🏷️ 标签系统
- 自定义标签分类
- 自定义标签颜色（支持任意颜色选择）
- 标签快速筛选

### 🔗 Obsidian 同步
- 自动同步任务到 Obsidian 笔记库
- Markdown 格式导出
- 按日期归档

### ⚡ 快捷操作
- 全局快捷键 `Ctrl+Shift+O` 快速录入
- 系统托盘常驻
- 最小化到托盘

---

## 📸 截图预览

| 今日任务 | 日历视图 |
|:---:|:---:|
| ![今日任务](原型/今日任务列表.png) | ![日历视图](原型/任务日历视图.html) |

---

## 🚀 快速开始

### 安装

1. 从 [Releases](https://github.com/IsHexx/ToDoReminder/releases) 下载最新版本
2. 运行 `ToDoReminder Setup x.x.x.exe`
3. 按提示完成安装

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/IsHexx/ToDoReminder.git
cd ToDoReminder

# 安装依赖
npm install

# 启动开发
npm start

# 打包
npm run build
```

---

## 🛠️ 技术栈

- **Electron** - 跨平台桌面应用框架
- **HTML/CSS/JavaScript** - 前端技术
- **Tailwind CSS** - 样式框架
- **Node.js** - 后端运行时

---

## 📁 项目结构

```
ToDoReminder/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── package.json         # 项目配置
├── assets/              # 应用图标
│   ├── icon.png
│   └── icon.svg
├── src/
│   └── renderer/        # 渲染进程（前端）
│       ├── index.html   # 主页面
│       ├── js/
│       │   └── app.js   # 应用逻辑
│       ├── styles/
│       │   └── main.css # 样式文件
│       └── assets/      # 前端资源
└── 原型/                 # 设计原型文件
```

---

## ⚙️ 配置说明

### Obsidian 同步设置

1. 打开 **设置** 页面
2. 点击 **选择文件夹** 选择你的 Obsidian 笔记库路径
3. 点击 **保存设置**
4. 在侧边栏点击同步按钮即可同步

### 数据存储

所有数据保存在本地：
- Windows: `%APPDATA%/todoreminder/data/`
  - `tasks.json` - 任务数据
  - `settings.json` - 设置配置

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Material Symbols](https://fonts.google.com/icons)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/IsHexx">IsHexx</a>
</p>
