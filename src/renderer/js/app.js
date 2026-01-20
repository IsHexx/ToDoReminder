// ToDoReminder - 主应用逻辑
(function () {
    'use strict';

    // 状态管理
    let tasks = [];
    let settings = {};
    let userTags = []; // 用户定义的标签列表
    let customColors = []; // 用户自定义的颜色列表
    let currentView = 'today';
    let currentCalendarDate = new Date();
    let editingTaskId = null;
    let currentFilter = { type: null, value: null }; // 当前筛选条件

    // DOM 元素缓存
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

    // 初始化
    async function init() {
        await loadData();
        loadTags(); // 加载用户标签
        setupEventListeners();
        renderCurrentDate();
        renderTasks();
        updateProgress();
        updateObsidianConnectionStatus(); // 更新 Obsidian 连接状态

        // 监听任务更新
        if (window.electronAPI) {
            window.electronAPI.onTasksUpdated((updatedTasks) => {
                tasks = updatedTasks;
                renderTasks();
                updateProgress();
            });

            window.electronAPI.onSyncComplete((time) => {
                showSyncStatus('success', time);
            });

            window.electronAPI.onSyncError((error) => {
                showSyncStatus('error', error);
            });
        }
    }

    // 加载数据
    async function loadData() {
        if (window.electronAPI) {
            tasks = await window.electronAPI.getTasks();
            settings = await window.electronAPI.getSettings();
            applySettings();
        }
    }

    // 应用设置
    function applySettings() {
        if (settings.obsidianPath) {
            $('#input-obsidian-path').value = settings.obsidianPath;
        }
        if (settings.syncTime) {
            $('#input-sync-time').value = settings.syncTime;
        }
        $('#toggle-auto-sync').checked = settings.autoSync !== false;
        $('#toggle-minimize-tray').checked = settings.minimizeToTray !== false;
        $('#toggle-start-windows').checked = settings.startWithWindows === true;
    }

    // 设置事件监听
    function setupEventListeners() {
        // 导航
        $$('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view) switchView(view);
            });
        });

        $('#btn-settings').addEventListener('click', () => switchView('settings'));

        // 添加任务
        $('#btn-add-task').addEventListener('click', openAddTaskModal);
        $('#btn-calendar-add')?.addEventListener('click', openAddTaskModal);
        $('#btn-close-modal').addEventListener('click', closeAddTaskModal);
        $('#btn-cancel-task').addEventListener('click', closeAddTaskModal);
        $('#modal-add-task').addEventListener('click', (e) => {
            if (e.target.id === 'modal-add-task') closeAddTaskModal();
        });

        // 提交任务表单
        $('#form-add-task').addEventListener('submit', handleTaskSubmit);

        // 日历导航
        $('#btn-prev-month')?.addEventListener('click', () => navigateCalendar(-1));
        $('#btn-next-month')?.addEventListener('click', () => navigateCalendar(1));
        $('#btn-week-view')?.addEventListener('click', () => setCalendarView('week'));
        $('#btn-month-view')?.addEventListener('click', () => setCalendarView('month'));

        // 设置页面
        $('#btn-browse-folder')?.addEventListener('click', browseFolder);
        $('#btn-save-settings')?.addEventListener('click', saveSettingsHandler);
        $('#btn-sync-now')?.addEventListener('click', syncNow);
        $('#btn-reset-settings')?.addEventListener('click', resetSettings);

        // 任务弹窗工具栏按钮
        $('#btn-priority')?.addEventListener('click', showPrioritySelector);
        $('#btn-tag')?.addEventListener('click', showTagSelector);
        $('#btn-time')?.addEventListener('click', showTimeSelector);
        $('#btn-repeat')?.addEventListener('click', showRepeatSelector);
        $('#btn-date')?.addEventListener('click', showDateSelector);

        // 标签管理页面
        $('#btn-add-tag')?.addEventListener('click', addTag);

        // 筛选菜单
        $('#btn-more')?.addEventListener('click', (e) => showFilterMenu(e));

        // 设置默认日期为今天
        const today = new Date().toISOString().split('T')[0];
        $('#input-task-date').value = today;
    }

    // 显示优先级选择器
    function showPrioritySelector() {
        const priorities = ['低', '中', '高'];
        const colors = {
            '低': 'bg-tertiary/10 text-tertiary border-tertiary/20',
            '中': 'bg-secondary/10 text-secondary border-secondary/20',
            '高': 'bg-red-100 text-red-600 border-red-200'
        };

        const current = $('#select-task-priority').value;
        const nextIndex = (priorities.indexOf(current) + 1) % priorities.length;
        const newPriority = priorities[nextIndex];

        $('#select-task-priority').value = newPriority;
        updateTagsPreview();
    }

    // 显示标签输入
    function showTagInput() {
        showInputModal('添加标签', '输入标签名称:', '', (tag) => {
            if (tag && tag.trim()) {
                const currentTags = $('#input-task-tags').value;
                const newTags = currentTags ? `${currentTags}, ${tag.trim()}` : tag.trim();
                $('#input-task-tags').value = newTags;
                updateTagsPreview();
            }
        });
    }

    // 显示时间选择器
    function showTimeSelector() {
        showPickerModal('time', '设置提醒时间', $('#input-task-time').value || '09:00', (time) => {
            if (time) {
                $('#input-task-time').value = time;
                updateTagsPreview();
            }
        });
    }

    // 显示重复周期选择器
    function showRepeatSelector() {
        const repeats = ['', '每天', '每周', '每月'];
        const labels = ['不重复', '每天', '每周', '每月'];

        const current = $('#select-task-repeat').value;
        const currentIndex = repeats.indexOf(current);
        const nextIndex = (currentIndex + 1) % repeats.length;

        $('#select-task-repeat').value = repeats[nextIndex];
        updateTagsPreview();
    }

    // 显示日期选择器
    function showDateSelector() {
        showPickerModal('date', '设置任务日期', $('#input-task-date').value || new Date().toISOString().split('T')[0], (date) => {
            if (date) {
                $('#input-task-date').value = date;
                updateTagsPreview();
            }
        });
    }

    // 通用时间/日期选择器弹窗
    function showPickerModal(type, title, defaultValue, onConfirm) {
        const existingModal = document.getElementById('picker-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'picker-modal';
        modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[70]';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 border border-border-subtle dark:border-gray-700 overflow-hidden">
                <div class="px-5 pt-4 pb-3 border-b border-border-subtle dark:border-gray-700">
                    <h4 class="text-base font-bold text-text-main dark:text-white">${title}</h4>
                </div>
                <div class="px-5 py-6 flex justify-center">
                    <input type="${type}" id="picker-input-field" value="${defaultValue}" 
                        class="w-full max-w-xs text-center text-2xl font-medium rounded-lg border-2 border-primary/30 bg-background-light dark:bg-background-dark py-4 px-4 text-text-main dark:text-white focus:ring-primary focus:border-primary">
                </div>
                <div class="px-5 py-3 bg-gray-50 dark:bg-black/20 flex justify-end gap-2">
                    <button id="picker-cancel-btn" class="px-4 py-2 text-sm font-medium text-text-sub hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">取消</button>
                    <button id="picker-confirm-btn" class="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const inputField = modal.querySelector('#picker-input-field');
        inputField.focus();

        const closeModal = () => modal.remove();

        modal.querySelector('#picker-confirm-btn').addEventListener('click', () => {
            if (onConfirm) onConfirm(inputField.value);
            closeModal();
        });

        modal.querySelector('#picker-cancel-btn').addEventListener('click', closeModal);

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (onConfirm) onConfirm(inputField.value);
                closeModal();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 更新标签预览区
    function updateTagsPreview() {
        const preview = $('#selected-tags-preview');
        if (!preview) return;

        let html = '';

        // 优先级
        const priority = $('#select-task-priority').value;
        if (priority) {
            const priorityColors = {
                '低': 'bg-tertiary/10 text-tertiary border-tertiary/20',
                '中': 'bg-secondary/10 text-secondary border-secondary/20',
                '高': 'bg-red-100 text-red-600 border-red-200'
            };
            html += `<div class="group flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-md ${priorityColors[priority]} pl-2 pr-3 border cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">flag</span>
                <span class="text-xs font-bold">${priority}</span>
            </div>`;
        }

        // 时间
        const time = $('#input-task-time').value;
        if (time) {
            html += `<div class="group flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-md bg-primary/10 text-primary border-primary/20 pl-2 pr-3 border cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">schedule</span>
                <span class="text-xs font-bold">${time}</span>
            </div>`;
        }

        // 重复
        const repeat = $('#select-task-repeat').value;
        if (repeat) {
            html += `<div class="group flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-md bg-primary/10 text-primary border-primary/20 pl-2 pr-3 border cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">repeat</span>
                <span class="text-xs font-bold">${repeat}</span>
            </div>`;
        }

        // 标签
        const tagsInput = $('#input-task-tags').value;
        if (tagsInput) {
            const tags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t);
            tags.forEach(tag => {
                html += `<div class="group flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-md bg-tertiary/10 text-tertiary border-tertiary/20 pl-2 pr-3 border cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">tag</span>
                    <span class="text-xs font-bold">${escapeHtml(tag)}</span>
                </div>`;
            });
        }

        preview.innerHTML = html;
    }

    // 切换视图
    function switchView(viewName) {
        currentView = viewName;

        // 更新导航状态
        $$('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            }
        });

        // 显示对应视图
        $$('.view').forEach(view => view.classList.add('hidden'));
        const targetView = $(`#view-${viewName}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('flex');
        }

        // 渲染视图内容
        if (viewName === 'calendar') {
            renderCalendar();
        } else if (viewName === 'today') {
            renderTasks();
        } else if (viewName === 'tags') {
            renderTags();
        } else if (viewName === 'upcoming') {
            renderUpcomingTasks();
        } else if (viewName === 'settings') {
            loadSettingsToUI();
        }
    }

    // 加载设置到 UI
    function loadSettingsToUI() {
        const obsidianPathInput = $('#input-obsidian-path');
        const syncTimeInput = $('#input-sync-time');
        const autoSyncToggle = $('#toggle-auto-sync');
        const minimizeToggle = $('#toggle-minimize-tray');
        const startWindowsToggle = $('#toggle-start-windows');

        if (obsidianPathInput) obsidianPathInput.value = settings.obsidianPath || '';
        if (syncTimeInput) syncTimeInput.value = settings.syncTime || '08:00';
        if (autoSyncToggle) autoSyncToggle.checked = settings.autoSync !== false;
        if (minimizeToggle) minimizeToggle.checked = settings.minimizeToTray !== false;
        if (startWindowsToggle) startWindowsToggle.checked = settings.startWithWindows === true;
    }

    // 渲染即将到来任务列表
    function renderUpcomingTasks() {
        const container = $('#upcoming-task-list');
        if (!container) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 获取未来7天
        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            days.push(date.toISOString().split('T')[0]);
        }

        // 按日期分组任务
        let html = '';
        days.forEach((dateStr, index) => {
            const dayTasks = tasks.filter(t => {
                const taskDate = t.date || new Date().toISOString().split('T')[0];
                return taskDate === dateStr && t.status !== '完成';
            });

            if (dayTasks.length === 0 && index > 0) return; // 跳过没有任务的未来日期，但保留今天

            const date = new Date(dateStr);
            const dayLabel = index === 0 ? '今天' :
                index === 1 ? '明天' :
                    date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' });

            html += `
                <div class="date-group">
                    <h3 class="text-sm font-bold text-text-main dark:text-white mb-3 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-[18px]">calendar_today</span>
                        ${dayLabel}
                        <span class="text-xs font-normal text-text-sub">(${dayTasks.length} 个任务)</span>
                    </h3>
                    <div class="space-y-3">
                        ${dayTasks.length > 0 ? dayTasks.map(t => createTaskCard(t)).join('') :
                    '<p class="text-sm text-text-sub pl-6">暂无任务</p>'}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="text-center py-12 text-text-sub">未来 7 天暂无任务</div>';

        // 绑定任务事件
        bindTaskEvents(container);
    }

    // 绑定任务卡片事件（复用）
    function bindTaskEvents(container) {
        container.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const taskId = e.target.dataset.id;
                const status = e.target.checked ? '完成' : '待办';
                updateTaskStatus(taskId, status);
            });
        });

        container.querySelectorAll('.btn-delete-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                deleteTask(taskId);
            });
        });

        container.querySelectorAll('.btn-edit-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                editTask(taskId);
            });
        });

        container.querySelectorAll('.btn-snooze-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                showSnoozeOptions(taskId, e);
            });
        });

        container.querySelectorAll('.task-title').forEach(title => {
            title.addEventListener('click', (e) => {
                const taskId = e.target.dataset.id;
                if (taskId) editTask(taskId);
            });
        });
    }

    // 显示筛选菜单
    function showFilterMenu(event) {
        const existingPopup = document.getElementById('filter-popup');
        if (existingPopup) existingPopup.remove();

        const btn = event.target.closest('button');
        const rect = btn.getBoundingClientRect();

        // 收集所有使用中的标签
        const usedTags = [...new Set(tasks.flatMap(t => t.tags || []))];
        const tagOptions = usedTags.map(tag =>
            `<button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-tertiary/10 hover:text-tertiary transition-colors flex items-center gap-2" data-type="tag" data-value="${tag}">
                <span class="material-symbols-outlined text-[16px]">tag</span> ${tag}
            </button>`
        ).join('');

        const popup = document.createElement('div');
        popup.id = 'filter-popup';
        popup.className = 'fixed z-[100] bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-border-subtle dark:border-gray-700 py-2 min-w-[160px] max-h-[400px] overflow-y-auto';
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.right = `${window.innerWidth - rect.right}px`;
        popup.innerHTML = `
            <div class="px-3 py-1.5 text-xs font-bold text-text-sub uppercase tracking-wide">按优先级</div>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-red-50 hover:text-red-600 transition-colors flex items-center gap-2" data-type="priority" data-value="高">
                <span class="w-2 h-2 rounded-full bg-red-500"></span> 高优先级
            </button>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-secondary/10 hover:text-secondary transition-colors flex items-center gap-2" data-type="priority" data-value="中">
                <span class="w-2 h-2 rounded-full bg-secondary"></span> 中优先级
            </button>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-tertiary/10 hover:text-tertiary transition-colors flex items-center gap-2" data-type="priority" data-value="低">
                <span class="w-2 h-2 rounded-full bg-tertiary"></span> 低优先级
            </button>
            <div class="border-t border-border-subtle dark:border-gray-700 my-1"></div>
            <div class="px-3 py-1.5 text-xs font-bold text-text-sub uppercase tracking-wide">按状态</div>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2" data-type="status" data-value="待办">
                <span class="material-symbols-outlined text-[16px]">radio_button_unchecked</span> 待办
            </button>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2" data-type="status" data-value="完成">
                <span class="material-symbols-outlined text-[16px]">check_circle</span> 已完成
            </button>
            <button class="filter-option w-full px-3 py-2 text-left text-sm hover:bg-secondary/10 hover:text-secondary transition-colors flex items-center gap-2" data-type="status" data-value="延迟">
                <span class="material-symbols-outlined text-[16px]">pending_actions</span> 已延迟
            </button>
            ${usedTags.length > 0 ? `
                <div class="border-t border-border-subtle dark:border-gray-700 my-1"></div>
                <div class="px-3 py-1.5 text-xs font-bold text-text-sub uppercase tracking-wide">按标签</div>
                ${tagOptions}
            ` : ''}
            <div class="border-t border-border-subtle dark:border-gray-700 my-1"></div>
            <button id="filter-clear" class="w-full px-3 py-2 text-left text-sm text-text-sub hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px]">filter_alt_off</span> 清除筛选
            </button>
        `;

        document.body.appendChild(popup);

        // 绑定选项点击事件
        popup.querySelectorAll('.filter-option').forEach(opt => {
            opt.addEventListener('click', () => {
                currentFilter = {
                    type: opt.dataset.type,
                    value: opt.dataset.value
                };
                renderTasks();
                updateProgress();
                popup.remove();
            });
        });

        popup.querySelector('#filter-clear').addEventListener('click', () => {
            currentFilter = { type: null, value: null };
            renderTasks();
            updateProgress();
            popup.remove();
        });

        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target) && !btn.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 10);
    }

    // 渲染当前日期
    function renderCurrentDate() {
        const now = new Date();
        const options = { month: 'long', day: 'numeric', weekday: 'long' };
        const dateStr = now.toLocaleDateString('zh-CN', options);
        $('#current-date').textContent = dateStr;
    }

    // 渲染任务列表
    function renderTasks() {
        const taskList = $('#task-list');
        const emptyState = $('#empty-state');
        const today = new Date().toISOString().split('T')[0];

        // 筛选今日任务
        let filteredTasks = tasks.filter(task => {
            const taskDate = task.date || today;
            return taskDate === today;
        });

        // 应用筛选条件
        if (currentFilter.type === 'tag' && currentFilter.value) {
            filteredTasks = filteredTasks.filter(task =>
                task.tags && task.tags.includes(currentFilter.value)
            );
        } else if (currentFilter.type === 'priority' && currentFilter.value) {
            filteredTasks = filteredTasks.filter(task =>
                task.priority === currentFilter.value
            );
        } else if (currentFilter.type === 'status' && currentFilter.value) {
            filteredTasks = filteredTasks.filter(task =>
                task.status === currentFilter.value
            );
        }

        if (filteredTasks.length === 0) {
            taskList.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // 按时间排序
        filteredTasks.sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        taskList.innerHTML = filteredTasks.map(task => createTaskCard(task)).join('');

        // 绑定任务操作事件
        taskList.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const taskId = e.target.dataset.id;
                const status = e.target.checked ? '完成' : '待办';
                updateTaskStatus(taskId, status);
            });
        });

        taskList.querySelectorAll('.btn-delete-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                deleteTask(taskId);
            });
        });

        // 绑定编辑按钮事件
        taskList.querySelectorAll('.btn-edit-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                editTask(taskId);
            });
        });

        // 点击任务标题也可编辑
        taskList.querySelectorAll('.task-title').forEach(title => {
            title.addEventListener('click', (e) => {
                const taskId = e.target.dataset.id;
                if (taskId) editTask(taskId);
            });
        });

        // 绑定延迟按钮事件
        taskList.querySelectorAll('.btn-snooze-task').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('button').dataset.id;
                showSnoozeOptions(taskId, e);
            });
        });
    }

    // 显示延迟时间选项
    function showSnoozeOptions(taskId, event) {
        const existingPopup = document.getElementById('snooze-popup');
        if (existingPopup) existingPopup.remove();

        const btn = event.target.closest('button');
        const rect = btn.getBoundingClientRect();

        const popup = document.createElement('div');
        popup.id = 'snooze-popup';
        popup.className = 'fixed z-[100] bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-border-subtle dark:border-gray-700 py-2 min-w-[140px]';
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.left = `${rect.left - 50}px`;
        popup.innerHTML = `
            <div class="px-3 py-1.5 text-xs font-bold text-text-sub uppercase tracking-wide">延迟提醒</div>
            <button class="snooze-option w-full px-3 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2" data-minutes="5">
                <span class="material-symbols-outlined text-[18px]">timer</span> 5 分钟
            </button>
            <button class="snooze-option w-full px-3 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2" data-minutes="10">
                <span class="material-symbols-outlined text-[18px]">timer</span> 10 分钟
            </button>
            <button class="snooze-option w-full px-3 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2" data-minutes="30">
                <span class="material-symbols-outlined text-[18px]">timer</span> 30 分钟
            </button>
            <div class="border-t border-border-subtle dark:border-gray-700 my-1"></div>
            <button class="snooze-delay w-full px-3 py-2 text-left text-sm hover:bg-secondary/10 hover:text-secondary transition-colors flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">pending_actions</span> 标记为延迟
            </button>
        `;

        document.body.appendChild(popup);

        // 绑定选项点击事件
        popup.querySelectorAll('.snooze-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const minutes = parseInt(opt.dataset.minutes);
                snoozeTask(taskId, minutes);
                popup.remove();
            });
        });

        popup.querySelector('.snooze-delay').addEventListener('click', () => {
            updateTaskStatus(taskId, '延迟');
            popup.remove();
        });

        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target) && !btn.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 10);
    }

    // 延迟任务提醒
    function snoozeTask(taskId, minutes) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // 计算新的提醒时间
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);
        const newTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        task.time = newTime;
        task.status = '待办'; // 重置为待办状态

        // 保存更新
        if (window.electronAPI) {
            window.electronAPI.saveTask(task).then(updatedTasks => {
                tasks = updatedTasks;
                renderTasks();
                updateProgress();
            });
        }

        // 显示提示
        showInputModal('延迟成功', `任务将在 ${newTime} 提醒`, '', null, true);
    }

    // 获取标签颜色
    function getTagColor(tagName) {
        const tag = userTags.find(t =>
            (typeof t === 'string' ? t : t.name) === tagName
        );
        if (!tag) return '#3b82f6';
        return typeof tag === 'string' ? '#3b82f6' : (tag.color || '#3b82f6');
    }

    // 创建任务卡片 HTML
    function createTaskCard(task) {
        const isCompleted = task.status === '完成';
        const isDelayed = task.status === '延迟';
        const priorityClass = getPriorityClass(task.priority);
        const priorityLabel = task.priority || '中';
        const tags = task.tags ? task.tags.map(t => {
            const color = getTagColor(t);
            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer transition-colors" style="background-color: ${color}15; color: ${color}">#${escapeHtml(t)}</span>`;
        }).join('') : '';
        const statusClass = isDelayed ? 'border-l-4 border-l-secondary' : '';

        return `
            <div class="task-card group ${isCompleted ? 'completed' : ''} ${statusClass} bg-white dark:bg-surface-dark rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-border-subtle dark:border-gray-700" data-id="${task.id}">
                <div class="flex items-start gap-4">
                    <label class="checkbox-wrapper mt-1">
                        <input type="checkbox" class="task-checkbox sr-only" data-id="${task.id}" ${isCompleted ? 'checked' : ''}>
                        <div class="checkbox-circle">
                            <svg class="checkbox-svg w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        </div>
                    </label>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start">
                            <h3 class="task-title font-display text-base font-bold text-text-main truncate group-hover:text-primary transition-colors cursor-pointer no-underline" data-id="${task.id}">${escapeHtml(task.title)}</h3>
                            ${task.time ? `<span class="text-xs font-mono text-text-sub">${task.time}</span>` : ''}
                        </div>
                        <div class="mt-2 flex items-center gap-3 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${priorityClass} text-xs font-bold uppercase tracking-wider">
                                <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                                ${priorityLabel}
                            </span>
                            ${isDelayed ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/10 text-secondary text-xs font-bold">延迟</span>' : ''}
                            ${tags}
                            ${task.repeat ? `<span class="text-xs text-text-sub"><span class="material-symbols-outlined text-sm align-middle">repeat</span> ${task.repeat}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit-task p-1.5 hover:bg-primary/10 rounded text-text-sub hover:text-primary transition-colors" data-id="${task.id}" title="编辑">
                            <span class="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button class="btn-snooze-task p-1.5 hover:bg-secondary/10 rounded text-text-sub hover:text-secondary transition-colors" data-id="${task.id}" title="延迟">
                            <span class="material-symbols-outlined text-lg">snooze</span>
                        </button>
                        <button class="btn-delete-task p-1.5 hover:bg-red-50 rounded text-text-sub hover:text-red-600 transition-colors" data-id="${task.id}" title="删除">
                            <span class="material-symbols-outlined text-lg">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // 获取优先级样式类
    function getPriorityClass(priority) {
        switch (priority) {
            case '高': return 'priority-high';
            case '低': return 'priority-low';
            default: return 'priority-medium';
        }
    }

    // 更新进度
    function updateProgress() {
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = tasks.filter(t => (t.date || today) === today);
        const completed = todayTasks.filter(t => t.status === '完成').length;
        const total = todayTasks.length;
        const remaining = total - completed;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        $('#remaining-count').textContent = `剩余 ${remaining} 个任务`;
        $('#progress-percent').textContent = `${percent}%`;
        $('#today-count').textContent = remaining;

        // 更新 SVG 进度环
        const progressCircle = $('#progress-circle');
        if (progressCircle) {
            const circumference = 2 * Math.PI * 36; // r=36
            const offset = circumference - (percent / 100) * circumference;
            progressCircle.style.strokeDashoffset = offset;
        }

        const motivationTexts = [
            '添加任务开始今天的工作',
            '保持势头，继续加油！',
            '太棒了，快完成了！',
            '全部完成，做得好！'
        ];
        const textIndex = percent === 100 ? 3 : percent > 50 ? 2 : percent > 0 ? 1 : 0;
        $('#motivation-text').textContent = motivationTexts[textIndex];
    }

    // 渲染日历
    function renderCalendar() {
        // 根据视图模式选择渲染方式
        if (calendarViewMode === 'week') {
            renderWeekView();
            return;
        }

        const grid = $('#calendar-grid');
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        $('#calendar-title').textContent = `${year}年${month + 1}月`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const today = new Date().toISOString().split('T')[0];

        let html = '';

        // 上月日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += `<div class="calendar-day other-month"><span class="day-number">${day}</span></div>`;
        }

        // 当月日期
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const dayTasks = tasks.filter(t => t.date === dateStr);

            let taskHtml = '<div class="space-y-1 mt-1">';
            dayTasks.slice(0, 3).forEach((task, index) => {
                // 获取标签颜色，如无标签则使用预设颜色轮换
                const defaultColors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899'];
                let tagColor = defaultColors[index % defaultColors.length];

                if (task.tags && task.tags.length > 0) {
                    const firstTag = task.tags[0];
                    const tagObj = userTags.find(t => (typeof t === 'string' ? t : t.name) === firstTag);
                    if (tagObj && typeof tagObj !== 'string') {
                        tagColor = tagObj.color || tagColor;
                    }
                }

                taskHtml += `
                    <div class="calendar-task flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] cursor-pointer hover:brightness-95 transition-all" 
                        style="background-color: ${tagColor}15; border-left: 3px solid ${tagColor};" 
                        data-id="${task.id}">
                        <span class="truncate flex-1 font-medium" style="color: ${tagColor}">${escapeHtml(task.title)}</span>
                    </div>
                `;
            });
            taskHtml += '</div>';

            if (dayTasks.length > 3) {
                taskHtml += `<div class="text-[10px] text-text-sub text-center mt-1">+${dayTasks.length - 3} 更多</div>`;
            }

            html += `<div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <span class="day-number">${day}</span>
                ${dayTasks.length > 0 ? taskHtml : ''}
            </div>`;
        }

        // 下月日期 - 只填充到35天(5行)
        const totalDays = startDayOfWeek + daysInMonth;
        const remainingDays = totalDays <= 35 ? (35 - totalDays) : (42 - totalDays);
        for (let day = 1; day <= remainingDays; day++) {
            html += `<div class="calendar-day other-month"><span class="day-number">${day}</span></div>`;
        }

        grid.innerHTML = html;

        // 绑定任务点击事件（月视图）
        grid.querySelectorAll('.calendar-task').forEach(task => {
            task.addEventListener('click', (e) => {
                const taskId = e.target.closest('.calendar-task').dataset.id;
                if (taskId) editTask(taskId);
            });
        });
    }

    // 日历导航
    function navigateCalendar(direction) {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
        renderCalendar();
    }

    let calendarViewMode = 'month'; // 'week' or 'month'

    function setCalendarView(view) {
        calendarViewMode = view;

        if (view === 'week') {
            $('#btn-week-view').classList.add('font-bold', 'text-primary', 'bg-white', 'shadow-sm');
            $('#btn-month-view').classList.remove('font-bold', 'text-primary', 'bg-white', 'shadow-sm');
        } else {
            $('#btn-month-view').classList.add('font-bold', 'text-primary', 'bg-white', 'shadow-sm');
            $('#btn-week-view').classList.remove('font-bold', 'text-primary', 'bg-white', 'shadow-sm');
        }

        renderCalendar();
    }

    // 渲染周视图
    function renderWeekView() {
        const grid = $('#calendar-grid');
        const today = new Date();
        const currentDay = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - currentDay);

        $('#calendar-title').textContent = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月 第${Math.ceil(weekStart.getDate() / 7)}周`;

        let html = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const isToday = dateStr === today.toISOString().split('T')[0];
            const dayTasks = tasks.filter(t => t.date === dateStr);

            let taskHtml = '';
            dayTasks.forEach(task => {
                const color = task.priority === '高' ? 'var(--primary)' : task.priority === '低' ? 'var(--tertiary)' : 'var(--secondary)';
                const statusIcon = task.status === '完成' ? 'check_circle' : task.status === '延迟' ? 'pending_actions' : '';
                taskHtml += `
                    <div class="calendar-task cursor-pointer" style="border-color: ${color}; background: ${color}20; color: ${color}" data-id="${task.id}">
                        ${statusIcon ? `<span class="material-symbols-outlined text-xs mr-1">${statusIcon}</span>` : ''}
                        ${task.time ? `<span class="text-xs opacity-70">${task.time}</span> ` : ''}
                        ${escapeHtml(task.title)}
                    </div>`;
            });

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} min-h-[200px]" data-date="${dateStr}">
                    <span class="day-number">${date.getDate()}</span>
                    <div class="text-xs text-text-sub mb-2">${['日', '一', '二', '三', '四', '五', '六'][i]}</div>
                    ${taskHtml}
                </div>`;
        }

        grid.innerHTML = html;

        // 绑定任务点击事件
        grid.querySelectorAll('.calendar-task').forEach(task => {
            task.addEventListener('click', (e) => {
                const taskId = e.target.closest('.calendar-task').dataset.id;
                if (taskId) editTask(taskId);
            });
        });
    }

    // 打开添加任务模态框
    function openAddTaskModal() {
        editingTaskId = null;
        // 更新弹窗标题
        const titleEl = document.querySelector('#modal-add-task h3');
        if (titleEl) titleEl.textContent = '快速任务录入';
        // 清空表单
        $('#input-task-title').value = '';
        $('#input-task-time').value = '';
        $('#input-task-date').value = new Date().toISOString().split('T')[0];
        $('#select-task-priority').value = '中';
        $('#select-task-repeat').value = '';
        $('#input-task-tags').value = '';
        $('#selected-tags-preview').innerHTML = '';
        $('#modal-add-task').classList.remove('hidden');
    }

    // 编辑现有任务
    function editTask(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        editingTaskId = taskId;

        // 更新弹窗标题
        const titleEl = document.querySelector('#modal-add-task h3');
        if (titleEl) titleEl.textContent = '编辑任务';

        // 填充表单数据
        $('#input-task-title').value = task.title || '';
        $('#input-task-time').value = task.time || '';
        $('#input-task-date').value = task.date || new Date().toISOString().split('T')[0];
        $('#select-task-priority').value = task.priority || '中';
        $('#select-task-repeat').value = task.repeat || '';
        $('#input-task-tags').value = task.tags ? task.tags.join(', ') : '';

        // 更新预览
        updateTagsPreview();

        // 显示弹窗
        $('#modal-add-task').classList.remove('hidden');
    }

    // 关闭模态框
    function closeAddTaskModal() {
        $('#modal-add-task').classList.add('hidden');
        editingTaskId = null;
    }

    // 处理任务表单提交
    async function handleTaskSubmit(e) {
        e.preventDefault();

        const title = $('#input-task-title').value.trim();
        if (!title) return;

        const tagsInput = $('#input-task-tags').value.trim();
        const tags = tagsInput ? tagsInput.split(/[,，]/).map(t => t.trim()).filter(t => t) : [];

        const task = {
            id: editingTaskId || generateId(),
            title,
            time: $('#input-task-time').value || null,
            priority: $('#select-task-priority').value,
            repeat: $('#select-task-repeat').value || null,
            date: $('#input-task-date').value,
            tags,
            status: '待办',
            createdAt: new Date().toISOString()
        };

        if (window.electronAPI) {
            tasks = await window.electronAPI.saveTask(task);
        } else {
            if (editingTaskId) {
                const idx = tasks.findIndex(t => t.id === editingTaskId);
                if (idx >= 0) tasks[idx] = task;
            } else {
                tasks.push(task);
            }
        }

        renderTasks();
        updateProgress();
        if (currentView === 'calendar') renderCalendar();
        closeAddTaskModal();
    }

    // 更新任务状态
    async function updateTaskStatus(taskId, status) {
        if (window.electronAPI) {
            tasks = await window.electronAPI.updateTaskStatus(taskId, status);
        } else {
            const task = tasks.find(t => t.id === taskId);
            if (task) task.status = status;
        }
        renderTasks();
        updateProgress();
    }

    // 删除任务
    async function deleteTask(taskId) {
        if (window.electronAPI) {
            tasks = await window.electronAPI.deleteTask(taskId);
        } else {
            tasks = tasks.filter(t => t.id !== taskId);
        }
        renderTasks();
        updateProgress();
        if (currentView === 'calendar') renderCalendar();
    }

    // 设置相关
    async function browseFolder() {
        if (window.electronAPI) {
            const folder = await window.electronAPI.selectFolder();
            if (folder) {
                $('#input-obsidian-path').value = folder;
            }
        }
    }

    async function saveSettingsHandler() {
        // 保留现有的 userTags 和 customColors
        const existingUserTags = settings.userTags;
        const existingCustomColors = settings.customColors;

        settings = {
            ...settings, // 保留其他现有设置
            obsidianPath: $('#input-obsidian-path')?.value || '',
            syncTime: $('#input-sync-time')?.value || '08:00',
            autoSync: $('#toggle-auto-sync')?.checked ?? true,
            minimizeToTray: $('#toggle-minimize-tray')?.checked ?? true,
            startWithWindows: $('#toggle-start-windows')?.checked ?? false,
            globalShortcut: settings.globalShortcut || 'Ctrl+Shift+O',
            userTags: existingUserTags,
            customColors: existingCustomColors
        };

        if (window.electronAPI) {
            await window.electronAPI.saveSettings(settings);
        }
        showSyncStatus('saved');
    }

    async function syncNow() {
        if (window.electronAPI) {
            await window.electronAPI.syncObsidian();
        }
    }

    function resetSettings() {
        $('#input-obsidian-path').value = '';
        $('#input-sync-time').value = '08:00';
        $('#toggle-auto-sync').checked = true;
        $('#toggle-minimize-tray').checked = true;
        $('#toggle-start-windows').checked = false;
    }

    function showSyncStatus(type, detail) {
        const connectionStatus = $('#obsidian-connection-status');
        const lastSyncTime = $('#last-sync-time');

        if (!connectionStatus) return;

        if (type === 'success') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-green-500">cloud_done</span>
                <span class="text-xs text-green-600 font-medium">已连接至 Obsidian</span>
            `;
            if (lastSyncTime) {
                lastSyncTime.classList.remove('hidden');
                lastSyncTime.textContent = `最后同步: ${new Date(detail).toLocaleString('zh-CN')}`;
            }
        } else if (type === 'error') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-red-500">cloud_off</span>
                <span class="text-xs text-red-500">${detail || '同步失败'}</span>
            `;
        } else if (type === 'saved') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                <span class="text-xs text-primary font-medium">设置已保存</span>
            `;
        } else if (type === 'syncing') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-primary animate-spin">sync</span>
                <span class="text-xs text-text-sub">正在同步...</span>
            `;
        }
    }

    // 更新 Obsidian 连接状态
    function updateObsidianConnectionStatus() {
        const connectionStatus = $('#obsidian-connection-status');
        const lastSyncTime = $('#last-sync-time');

        if (!connectionStatus) return;

        if (settings.obsidianPath) {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-green-500">cloud_done</span>
                <span class="text-xs text-green-600 font-medium">已连接至 Obsidian</span>
            `;
            if (lastSyncTime && settings.lastSyncTime) {
                lastSyncTime.classList.remove('hidden');
                lastSyncTime.textContent = `最后同步: ${new Date(settings.lastSyncTime).toLocaleString('zh-CN')}`;
            }
        } else {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-gray-400">cloud_off</span>
                <span class="text-xs text-text-sub">未配置 Obsidian</span>
            `;
            if (lastSyncTime) lastSyncTime.classList.add('hidden');
        }
    }

    // 工具函数
    function generateId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============ 标签管理功能 ============

    // 渲染标签列表
    function renderTags() {
        const tagsList = $('#tags-list');
        const emptyState = $('#tags-empty');

        if (!tagsList) return;

        if (userTags.length === 0) {
            // 只显示快速添加卡片
            tagsList.innerHTML = `
                <div class="tag-card-add flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border-subtle dark:border-gray-700 hover:border-primary/50 cursor-pointer transition-all hover:bg-primary/5 min-h-[100px]">
                    <span class="material-symbols-outlined text-2xl text-text-sub mb-2">add_circle</span>
                    <span class="text-sm text-text-sub font-medium">快速添加</span>
                </div>
            `;
            tagsList.querySelector('.tag-card-add')?.addEventListener('click', addTag);
            emptyState?.classList.add('hidden');
            return;
        }

        emptyState?.classList.add('hidden');

        // 生成标签卡片
        const tagsHtml = userTags.map(tag => {
            const tagName = typeof tag === 'string' ? tag : tag.name;
            const tagColor = typeof tag === 'string' ? '#3b82f6' : (tag.color || '#3b82f6');
            const colorName = getColorName(tagColor);

            return `
                <div class="tag-card group relative p-4 rounded-xl border border-border-subtle dark:border-gray-700 bg-white dark:bg-surface-dark hover:shadow-md hover:border-primary/30 transition-all cursor-pointer" data-tag="${escapeHtml(tagName)}">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background-color: ${tagColor}20">
                            <span class="text-xl font-bold" style="color: ${tagColor}">#</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-text-main dark:text-white truncate">${escapeHtml(tagName)}</span>
                                <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${tagColor}"></div>
                            </div>
                            <span class="text-xs text-text-sub uppercase tracking-wide">${colorName}</span>
                        </div>
                    </div>
                    <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit-tag p-1.5 rounded-md hover:bg-primary/10 text-text-sub hover:text-primary transition-colors" data-tag="${escapeHtml(tagName)}">
                            <span class="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button class="btn-delete-tag p-1.5 rounded-md hover:bg-red-50 text-text-sub hover:text-red-600 transition-colors" data-tag="${escapeHtml(tagName)}">
                            <span class="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 添加快速添加卡片
        const quickAddHtml = `
            <div class="tag-card-add flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border-subtle dark:border-gray-700 hover:border-primary/50 cursor-pointer transition-all hover:bg-primary/5 min-h-[100px]">
                <span class="material-symbols-outlined text-2xl text-text-sub mb-2">add_circle</span>
                <span class="text-sm text-text-sub font-medium">快速添加</span>
            </div>
        `;

        tagsList.innerHTML = tagsHtml + quickAddHtml;

        // 绑定快速添加
        tagsList.querySelector('.tag-card-add')?.addEventListener('click', addTag);

        // 绑定编辑事件
        tagsList.querySelectorAll('.btn-edit-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagName = e.target.closest('button').dataset.tag;
                editTag(tagName);
            });
        });

        // 绑定删除事件
        tagsList.querySelectorAll('.btn-delete-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagName = e.target.closest('button').dataset.tag;
                deleteTag(tagName);
            });
        });

        // 点击卡片编辑
        tagsList.querySelectorAll('.tag-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    editTag(card.dataset.tag);
                }
            });
        });
    }

    // 获取颜色名称
    function getColorName(color) {
        const colorMap = {
            '#3b82f6': 'BLUE',
            '#22c55e': 'GREEN',
            '#a855f7': 'PURPLE',
            '#ec4899': 'PINK',
            '#f97316': 'ORANGE',
            '#06b6d4': 'CYAN',
            '#ef4444': 'RED',
            '#eab308': 'YELLOW',
        };
        return colorMap[color.toLowerCase()] || colorMap[color] || 'CUSTOM';
    }

    // 编辑标签
    function editTag(tagName) {
        const tagIndex = userTags.findIndex(t =>
            (typeof t === 'string' ? t : t.name) === tagName
        );
        if (tagIndex === -1) return;

        const tag = userTags[tagIndex];
        const existingTag = typeof tag === 'string'
            ? { name: tag, color: '#3b82f6' }
            : tag;

        showTagColorModal(existingTag, (newName, newColor) => {
            userTags[tagIndex] = { name: newName, color: newColor };
            saveTags();
            renderTags();
        });
    }

    // 预定义的标签颜色
    const TAG_COLORS = [
        { name: '蓝色', value: '#3b82f6' },
        { name: '绿色', value: '#22c55e' },
        { name: '紫色', value: '#a855f7' },
        { name: '粉色', value: '#ec4899' },
        { name: '橙色', value: '#f97316' },
        { name: '青色', value: '#06b6d4' },
        { name: '红色', value: '#ef4444' },
        { name: '黄色', value: '#eab308' },
    ];

    // 添加新标签（带颜色选择）
    function addTag() {
        showTagColorModal(null, (tagName, tagColor) => {
            if (tagName && tagName.trim()) {
                const trimmedTag = tagName.trim();
                const exists = userTags.some(t =>
                    (typeof t === 'string' ? t : t.name) === trimmedTag
                );
                if (!exists) {
                    userTags.push({ name: trimmedTag, color: tagColor });
                    saveTags();
                    renderTags();
                } else {
                    showInputModal('提示', '该标签已存在', '', null, true);
                }
            }
        });
    }

    // 显示标签颜色选择弹窗
    function showTagColorModal(existingTag, callback) {
        const existingModal = document.getElementById('tag-color-modal');
        if (existingModal) existingModal.remove();

        const selectedColor = existingTag?.color || TAG_COLORS[0].value;
        const tagName = existingTag?.name || '';

        const modal = document.createElement('div');
        modal.id = 'tag-color-modal';
        modal.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black/25 backdrop-blur-[1px]';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-[420px] rounded-lg shadow-xl flex flex-col overflow-hidden border border-border-subtle dark:border-gray-700">
                <!-- 标题栏 -->
                <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/80 border-b border-border-subtle dark:border-gray-700 flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-text-main dark:text-white tracking-wide">${existingTag ? '编辑标签' : '新建标签'}</h2>
                    <button id="tag-modal-close" class="text-text-sub hover:bg-red-500 hover:text-white rounded p-1 transition-colors">
                        <span class="material-symbols-outlined text-[18px] leading-none block">close</span>
                    </button>
                </div>
                
                <!-- 内容区 -->
                <div class="p-5 space-y-5 bg-white dark:bg-gray-900">
                    <!-- 标签名称 -->
                    <div class="space-y-1.5">
                        <label class="block text-xs font-medium text-text-sub ml-0.5">标签名称</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                <span class="text-text-sub font-bold text-xs">#</span>
                            </div>
                            <input type="text" id="tag-name-input" value="${escapeHtml(tagName)}" 
                                class="block w-full pl-7 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm text-text-main dark:text-white placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary transition-shadow"
                                placeholder="例如：健身" autocomplete="off">
                        </div>
                    </div>
                    
                    <!-- 颜色标记 -->
                    <div class="space-y-2">
                        <label class="block text-xs font-medium text-text-sub ml-0.5">颜色标记</label>
                        <div class="flex flex-wrap gap-2.5" id="color-options">
                            ${TAG_COLORS.map(c => `
                                <label class="cursor-pointer">
                                    <input type="radio" name="tagColor" value="${c.value}" class="sr-only color-radio" ${c.value === selectedColor ? 'checked' : ''}>
                                    <span class="block w-6 h-6 rounded-full hover:scale-110 transition-transform ${c.value === selectedColor ? 'ring-2 ring-offset-2 ring-primary' : ''}" style="background-color: ${c.value}"></span>
                                </label>
                            `).join('')}
                            ${customColors.map(c => `
                                <label class="cursor-pointer custom-saved-color">
                                    <input type="radio" name="tagColor" value="${c}" class="sr-only color-radio" ${c === selectedColor ? 'checked' : ''}>
                                    <span class="block w-6 h-6 rounded-full hover:scale-110 transition-transform ${c === selectedColor ? 'ring-2 ring-offset-2 ring-primary' : ''}" style="background-color: ${c}"></span>
                                </label>
                            `).join('')}
                            <!-- 添加自定义颜色 -->
                            <label class="cursor-pointer relative" id="custom-color-label">
                                <input type="color" id="custom-color-input" class="sr-only" value="#6366f1">
                                <span class="w-6 h-6 rounded-full border border-dashed border-gray-400 dark:border-gray-500 flex items-center justify-center hover:border-primary text-gray-400 hover:text-primary transition-colors hover:scale-110 bg-transparent" id="custom-color-btn">
                                    <span class="material-symbols-outlined text-[16px]">add</span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <!-- 按钮区 -->
                <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-border-subtle dark:border-gray-700 flex justify-end items-center gap-2">
                    <button id="tag-modal-cancel" class="px-4 py-1.5 min-w-[70px] text-xs font-medium text-text-main dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">取消</button>
                    <button id="tag-modal-confirm" class="px-4 py-1.5 min-w-[70px] text-xs font-medium text-white bg-primary border border-transparent rounded hover:bg-primary-dark transition-colors shadow-sm">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        let currentColor = selectedColor;
        const nameInput = modal.querySelector('#tag-name-input');
        nameInput.focus();
        nameInput.select();

        // 绑定颜色选择
        modal.querySelectorAll('.color-radio').forEach(radio => {
            radio.addEventListener('change', () => {
                modal.querySelectorAll('.color-radio').forEach(r => {
                    const span = r.nextElementSibling;
                    span.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
                });
                const customBtn = modal.querySelector('#custom-color-btn');
                customBtn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
                customBtn.style.backgroundColor = '';
                customBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">add</span>';

                const span = radio.nextElementSibling;
                span.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
                currentColor = radio.value;
            });
        });

        // 自定义颜色选择
        const customColorInput = modal.querySelector('#custom-color-input');
        const customColorBtn = modal.querySelector('#custom-color-btn');

        customColorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            customColorInput.click();
        });

        customColorInput.addEventListener('change', (e) => {
            const color = e.target.value;
            currentColor = color;

            // 检查是否已存在该颜色
            const isPreset = TAG_COLORS.some(c => c.value.toLowerCase() === color.toLowerCase());
            const isCustom = customColors.some(c => c.toLowerCase() === color.toLowerCase());

            // 如果是新颜色，添加到自定义颜色列表
            if (!isPreset && !isCustom) {
                customColors.push(color);
                saveTags(); // 保存自定义颜色

                // 在按钮前插入新的颜色圆圈
                const newColorLabel = document.createElement('label');
                newColorLabel.className = 'cursor-pointer custom-saved-color';
                newColorLabel.innerHTML = `
                    <input type="radio" name="tagColor" value="${color}" class="sr-only color-radio" checked>
                    <span class="block w-6 h-6 rounded-full hover:scale-110 transition-transform ring-2 ring-offset-2 ring-primary" style="background-color: ${color}"></span>
                `;
                modal.querySelector('#custom-color-label').before(newColorLabel);

                // 绑定新颜色的事件
                newColorLabel.querySelector('.color-radio').addEventListener('change', () => {
                    modal.querySelectorAll('.color-radio').forEach(r => {
                        const span = r.nextElementSibling;
                        span.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
                    });
                    newColorLabel.querySelector('span').classList.add('ring-2', 'ring-offset-2', 'ring-primary');
                    currentColor = color;
                });
            }

            // 清除其他颜色选中状态
            modal.querySelectorAll('.color-radio').forEach(r => {
                r.checked = r.value === color;
                const span = r.nextElementSibling;
                if (r.value === color) {
                    span.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
                } else {
                    span.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
                }
            });

            // 重置自定义按钮样式
            customColorBtn.style.backgroundColor = '';
            customColorBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">add</span>';
            customColorBtn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
        });

        // 关闭按钮
        modal.querySelector('#tag-modal-close').addEventListener('click', () => modal.remove());

        // 取消
        modal.querySelector('#tag-modal-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // 保存
        modal.querySelector('#tag-modal-confirm').addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                callback(name, currentColor);
                modal.remove();
            } else {
                nameInput.focus();
            }
        });

        // 回车确认
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#tag-modal-confirm').click();
            } else if (e.key === 'Escape') {
                modal.remove();
            }
        });
    }

    // 通用输入弹窗
    function showInputModal(title, message, defaultValue, onConfirm, isAlert = false) {
        const existingModal = document.getElementById('input-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'input-modal';
        modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[70]';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 border border-border-subtle dark:border-gray-700 overflow-hidden">
                <div class="px-5 pt-4 pb-3 border-b border-border-subtle dark:border-gray-700">
                    <h4 class="text-base font-bold text-text-main dark:text-white">${title}</h4>
                </div>
                <div class="px-5 py-4">
                    <p class="text-sm text-text-sub dark:text-gray-400 mb-3">${message}</p>
                    ${!isAlert ? `<input type="text" id="modal-input-field" value="${defaultValue}" 
                        class="w-full rounded-lg border border-border-subtle dark:border-gray-700 bg-background-light dark:bg-background-dark py-2.5 px-4 text-text-main dark:text-white focus:ring-primary focus:border-primary"
                        placeholder="输入内容...">` : ''}
                </div>
                <div class="px-5 py-3 bg-gray-50 dark:bg-black/20 flex justify-end gap-2">
                    ${!isAlert ? `<button id="modal-cancel-btn" class="px-4 py-2 text-sm font-medium text-text-sub hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">取消</button>` : ''}
                    <button id="modal-confirm-btn" class="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors">${isAlert ? '确定' : '确认'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const inputField = modal.querySelector('#modal-input-field');
        if (inputField) {
            inputField.focus();
            inputField.select();
        }

        const closeModal = () => modal.remove();

        modal.querySelector('#modal-confirm-btn').addEventListener('click', () => {
            if (onConfirm && inputField) {
                onConfirm(inputField.value);
            }
            closeModal();
        });

        const cancelBtn = modal.querySelector('#modal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }

        if (inputField) {
            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (onConfirm) onConfirm(inputField.value);
                    closeModal();
                } else if (e.key === 'Escape') {
                    closeModal();
                }
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 删除标签
    function deleteTag(tagName) {
        if (confirm(`确定要删除标签 "${tagName}" 吗？`)) {
            userTags = userTags.filter(t =>
                (typeof t === 'string' ? t : t.name) !== tagName
            );
            saveTags();
            renderTags();
        }
    }

    // 保存标签到本地存储
    function saveTags() {
        if (window.electronAPI) {
            // 可以将标签保存到 settings 中
            settings.userTags = userTags;
            settings.customColors = customColors;
            window.electronAPI.saveSettings(settings);
        } else {
            localStorage.setItem('userTags', JSON.stringify(userTags));
            localStorage.setItem('customColors', JSON.stringify(customColors));
        }
    }

    // 加载标签
    function loadTags() {
        if (settings.userTags) {
            userTags = settings.userTags;
        } else {
            const stored = localStorage.getItem('userTags');
            if (stored) {
                userTags = JSON.parse(stored);
            }
        }

        // 加载自定义颜色
        if (settings.customColors) {
            customColors = settings.customColors;
        } else {
            const storedColors = localStorage.getItem('customColors');
            if (storedColors) {
                customColors = JSON.parse(storedColors);
            }
        }
    }

    // 显示标签选择器（用于任务弹窗）
    function showTagSelector() {
        if (userTags.length === 0) {
            // 如果没有预设标签，回退到手动输入
            showTagInput();
            return;
        }

        // 创建标签选择弹窗
        const existingPopup = document.getElementById('tag-selector-popup');
        if (existingPopup) existingPopup.remove();

        const popup = document.createElement('div');
        popup.id = 'tag-selector-popup';
        popup.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-[60]';
        popup.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-4 border border-border-subtle dark:border-gray-700">
                <h4 class="text-sm font-bold text-text-main dark:text-white mb-3">选择标签</h4>
                <div class="space-y-2 max-h-60 overflow-y-auto mb-4">
                    ${userTags.map(tag => {
            const tagName = typeof tag === 'string' ? tag : tag.name;
            const tagColor = typeof tag === 'string' ? '#3b82f6' : (tag.color || '#3b82f6');
            return `
                            <button class="tag-option w-full flex items-center gap-2 p-2 rounded-lg hover:bg-tertiary/10 transition-colors text-left" data-tag="${escapeHtml(tagName)}">
                                <span class="text-lg font-bold" style="color: ${tagColor}">#</span>
                                <span class="text-sm font-medium text-text-main dark:text-white">${escapeHtml(tagName)}</span>
                            </button>
                        `;
        }).join('')}
                </div>
                <div class="flex gap-2 border-t border-border-subtle dark:border-gray-700 pt-3">
                    <button id="btn-tag-new" class="flex-1 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors">
                        + 新建标签
                    </button>
                    <button id="btn-tag-cancel" class="flex-1 py-2 text-sm font-medium text-text-sub hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        取消
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // 绑定事件
        popup.querySelectorAll('.tag-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                const currentTags = $('#input-task-tags').value;
                const tagsArray = currentTags ? currentTags.split(/[,，]/).map(t => t.trim()).filter(t => t) : [];
                if (!tagsArray.includes(tag)) {
                    tagsArray.push(tag);
                    $('#input-task-tags').value = tagsArray.join(', ');
                    updateTagsPreview();
                }
                popup.remove();
            });
        });

        popup.querySelector('#btn-tag-new').addEventListener('click', () => {
            popup.remove();
            showTagInput();
        });

        popup.querySelector('#btn-tag-cancel').addEventListener('click', () => {
            popup.remove();
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });
    }

    // 启动应用
    document.addEventListener('DOMContentLoaded', init);
})();
