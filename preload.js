const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 任务操作
    getTasks: () => ipcRenderer.invoke('get-tasks'),
    saveTask: (task) => ipcRenderer.invoke('save-task', task),
    deleteTask: (taskId) => ipcRenderer.invoke('delete-task', taskId),
    updateTaskStatus: (taskId, status) => ipcRenderer.invoke('update-task-status', taskId, status),

    // 设置操作
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // 同步操作
    syncObsidian: () => ipcRenderer.invoke('sync-obsidian'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // 快速输入窗口
    closeQuickInput: () => ipcRenderer.send('close-quick-input'),
    quickAddTask: (task) => ipcRenderer.send('quick-add-task', task),

    // 事件监听
    onTasksUpdated: (callback) => {
        ipcRenderer.on('tasks-updated', (event, tasks) => callback(tasks));
    },
    onSyncComplete: (callback) => {
        ipcRenderer.on('sync-complete', (event, time) => callback(time));
    },
    onSyncError: (callback) => {
        ipcRenderer.on('sync-error', (event, error) => callback(error));
    }
});
