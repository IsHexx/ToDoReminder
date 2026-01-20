const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, globalShortcut, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 保持窗口引用，防止被垃圾回收
let mainWindow = null;
let quickInputWindow = null;
let tray = null;

// 数据目录
const userDataPath = app.getPath('userData');
const dataPath = path.join(userDataPath, 'data');
const tasksFilePath = path.join(dataPath, 'tasks.json');
const settingsFilePath = path.join(dataPath, 'settings.json');

// 确保数据目录存在
function ensureDataDir() {
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }
}

// 默认设置
const defaultSettings = {
    obsidianPath: '',
    syncTime: '08:00',
    autoSync: true,
    minimizeToTray: true,
    startWithWindows: false,
    globalShortcut: 'Ctrl+Shift+O',
    theme: 'light'
};

// 加载设置
function loadSettings() {
    ensureDataDir();
    if (fs.existsSync(settingsFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
        } catch (e) {
            return defaultSettings;
        }
    }
    return defaultSettings;
}

// 保存设置
function saveSettings(settings) {
    ensureDataDir();
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
}

// 加载任务
function loadTasks() {
    ensureDataDir();
    if (fs.existsSync(tasksFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

// 保存任务
function saveTasks(tasks) {
    ensureDataDir();
    fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2), 'utf-8');
}

// 创建主窗口
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1322,
        height: 901,
        minWidth: 900,
        minHeight: 720,
        frame: true,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // 移除默认菜单
    mainWindow.setMenu(null);

    mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

    const settings = loadSettings();

    mainWindow.on('close', (event) => {
        if (settings.minimizeToTray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 创建快速输入窗口
function createQuickInputWindow() {
    if (quickInputWindow) {
        quickInputWindow.show();
        quickInputWindow.focus();
        return;
    }

    quickInputWindow = new BrowserWindow({
        width: 640,
        height: 280,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    quickInputWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'quickInput.html'));

    quickInputWindow.once('ready-to-show', () => {
        quickInputWindow.show();
        quickInputWindow.focus();
    });

    quickInputWindow.on('blur', () => {
        if (quickInputWindow && !quickInputWindow.isDestroyed()) {
            quickInputWindow.hide();
        }
    });

    quickInputWindow.on('closed', () => {
        quickInputWindow = null;
    });
}

// 创建系统托盘
function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    let trayIcon;

    if (fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath);
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
        // 创建默认图标
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createMainWindow();
                }
            }
        },
        {
            label: '快速添加任务',
            accelerator: 'Ctrl+Shift+O',
            click: () => {
                createQuickInputWindow();
            }
        },
        { type: 'separator' },
        {
            label: '立即同步到 Obsidian',
            click: () => {
                syncToObsidian();
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('ToDoReminder - 待办事项管理');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        } else {
            createMainWindow();
        }
    });
}

// 注册全局快捷键
function registerGlobalShortcut() {
    const settings = loadSettings();
    const shortcut = settings.globalShortcut || 'Ctrl+Shift+O';

    globalShortcut.unregisterAll();

    const registered = globalShortcut.register(shortcut, () => {
        createQuickInputWindow();
    });

    if (!registered) {
        console.error('快捷键注册失败:', shortcut);
    }
}

// 同步到 Obsidian
function syncToObsidian() {
    const settings = loadSettings();
    const tasks = loadTasks();

    if (!settings.obsidianPath) {
        if (mainWindow) {
            mainWindow.webContents.send('sync-error', '请先配置 Obsidian 库路径');
        }
        return;
    }

    // 按日期分组任务
    const tasksByDate = {};
    const today = new Date().toISOString().split('T')[0];

    tasks.forEach(task => {
        const date = task.date || today;
        if (!tasksByDate[date]) {
            tasksByDate[date] = [];
        }
        tasksByDate[date].push(task);
    });

    // 生成 Markdown 文件
    Object.keys(tasksByDate).forEach(date => {
        const dateTasks = tasksByDate[date];
        const dateObj = new Date(date);
        const dateHeader = dateObj.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

        let markdown = `# ${dateHeader}\n\n`;

        // 按状态分组
        const pending = dateTasks.filter(t => t.status === '待办');
        const delayed = dateTasks.filter(t => t.status === '延迟');
        const completed = dateTasks.filter(t => t.status === '完成');

        if (pending.length > 0 || delayed.length > 0) {
            markdown += `## 待办任务\n\n`;
            [...pending, ...delayed].forEach(task => {
                const statusMark = task.status === '延迟' ? '(延迟) ' : '';
                const tags = task.tags ? task.tags.map(t => `#${t}`).join(' ') : '';
                const priority = task.priority ? `@${task.priority}` : '';
                const timeInfo = task.time ? ` ⏰${task.time}` : '';
                const repeatInfo = task.repeat ? ` 🔄${task.repeat}` : '';

                markdown += `- [ ] ${statusMark}${task.title} ${tags} ${priority}${timeInfo}${repeatInfo}\n`;
            });
            markdown += '\n';
        }

        if (completed.length > 0) {
            markdown += `## 已完成\n\n`;
            completed.forEach(task => {
                const tags = task.tags ? task.tags.map(t => `#${t}`).join(' ') : '';
                markdown += `- [x] ${task.title} ${tags}\n`;
            });
            markdown += '\n';
        }

        const filePath = path.join(settings.obsidianPath, `${date}.md`);

        try {
            fs.writeFileSync(filePath, markdown, 'utf-8');
        } catch (e) {
            console.error('写入 Obsidian 文件失败:', e);
        }
    });

    if (mainWindow) {
        mainWindow.webContents.send('sync-complete', new Date().toISOString());
    }
}

// 显示通知
function showNotification(task) {
    const notification = new Notification({
        title: '⏰ 任务提醒',
        body: task.title,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        silent: false,
        urgency: 'critical',
        timeoutType: 'never', // 通知不会自动消失，需要手动关闭
        actions: [
            { type: 'button', text: '完成' },
            { type: 'button', text: '延迟 5 分钟' }
        ]
    });

    notification.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    notification.on('action', (event, index) => {
        if (index === 0) {
            // 完成任务
            const tasks = loadTasks();
            const taskIndex = tasks.findIndex(t => t.id === task.id);
            if (taskIndex >= 0) {
                tasks[taskIndex].status = '完成';
                saveTasks(tasks);
                if (mainWindow) {
                    mainWindow.webContents.send('tasks-updated', tasks);
                }
            }
        } else if (index === 1) {
            // 延迟 5 分钟
            setTimeout(() => {
                showNotification(task);
            }, 5 * 60 * 1000);
        }
    });

    notification.show();
}

// 任务调度器
let schedulerInterval = null;

function startScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }

    // 每分钟检查一次
    schedulerInterval = setInterval(() => {
        const tasks = loadTasks();
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const today = now.toISOString().split('T')[0];

        tasks.forEach(task => {
            if (task.status === '待办' && task.time === currentTime) {
                const taskDate = task.date || today;
                if (taskDate === today) {
                    showNotification(task);
                }
            }
        });

        // 检查是否需要同步
        const settings = loadSettings();
        if (settings.autoSync && settings.syncTime === currentTime) {
            syncToObsidian();
        }
    }, 60000); // 60秒
}

// IPC 事件处理
ipcMain.handle('get-tasks', () => {
    return loadTasks();
});

ipcMain.handle('save-task', (event, task) => {
    const tasks = loadTasks();
    const existingIndex = tasks.findIndex(t => t.id === task.id);

    if (existingIndex >= 0) {
        tasks[existingIndex] = task;
    } else {
        tasks.push(task);
    }

    saveTasks(tasks);
    return tasks;
});

ipcMain.handle('delete-task', (event, taskId) => {
    let tasks = loadTasks();
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks(tasks);
    return tasks;
});

ipcMain.handle('update-task-status', (event, taskId, status) => {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        const oldStatus = task.status;
        task.status = status;
        if (status === '完成') {
            task.completedAt = new Date().toISOString();

            // 如果是重复任务，自动创建下一个周期的任务
            if (task.repeat && oldStatus !== '完成') {
                const nextTask = createNextRepeatTask(task);
                if (nextTask) {
                    tasks.push(nextTask);
                }
            }
        }
        saveTasks(tasks);
    }

    return tasks;
});

// 创建下一个周期的重复任务
function createNextRepeatTask(task) {
    const currentDate = task.date ? new Date(task.date) : new Date();
    let nextDate = new Date(currentDate);

    switch (task.repeat) {
        case '每天':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case '每周':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case '每月':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        default:
            return null;
    }

    return {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: task.title,
        time: task.time,
        priority: task.priority,
        repeat: task.repeat,
        tags: task.tags ? [...task.tags] : [],
        date: nextDate.toISOString().split('T')[0],
        status: '待办',
        createdAt: new Date().toISOString()
    };
}

ipcMain.handle('get-settings', () => {
    return loadSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
    saveSettings(settings);
    registerGlobalShortcut();
    return settings;
});

ipcMain.handle('sync-obsidian', () => {
    syncToObsidian();
    return { success: true, time: new Date().toISOString() };
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.on('close-quick-input', () => {
    if (quickInputWindow) {
        quickInputWindow.hide();
    }
});

ipcMain.on('quick-add-task', (event, task) => {
    const tasks = loadTasks();
    tasks.push(task);
    saveTasks(tasks);

    if (mainWindow) {
        mainWindow.webContents.send('tasks-updated', tasks);
    }

    if (quickInputWindow) {
        quickInputWindow.hide();
    }
});

// 应用生命周期
app.whenReady().then(() => {
    ensureDataDir();
    createMainWindow();
    createTray();
    registerGlobalShortcut();
    startScheduler();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Windows 上保持应用在托盘运行
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});
