// ToDoReminder - 主应用逻辑
(function () {
    'use strict';

    // 状态管理
    // 状态管理
    let tasks = [];
    let settings = {};
    let userTags = []; // 用户定义的标签列表
    let customColors = []; // 用户自定义的颜色列表
    let currentView = 'today';
    let currentCalendarDate = new Date();
    let editingTaskId = null;
    let currentFilter = { type: null, value: null }; // 当前筛选条件
    let taskSortMode = 'time'; // 今日任务排序方式：time | priority
    let appInfo = { version: '', releaseNotes: [] };
    let aiPreviewTasks = [];

    // DOM 元素缓存
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

    function formatLocalDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 初始化
    async function init() {
        await loadData();
        loadTags(); // 加载用户标签
        setupEventListeners();
        renderCurrentDate();
        renderTasks();
        updateProgress();
        updateObsidianConnectionStatus(); // 更新 Obsidian 连接状态
        renderAppInfo();

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
            appInfo = await window.electronAPI.getAppInfo();
            applySettings();
        }
    }

    function renderAppInfo() {
        const version = appInfo.version || '--';
        const sidebarVersion = $('#app-version-sidebar');
        const settingsVersion = $('#app-version-settings');
        const releaseNotesList = $('#release-notes-list');

        if (sidebarVersion) {
            sidebarVersion.textContent = `v${version}`;
        }

        if (settingsVersion) {
            settingsVersion.textContent = `v${version}`;
        }

        if (!releaseNotesList) {
            return;
        }

        const notes = Array.isArray(appInfo.releaseNotes) ? appInfo.releaseNotes : [];
        if (notes.length === 0) {
            releaseNotesList.innerHTML = `
                <div class="rounded-md border border-border-subtle dark:border-gray-700 bg-background-light/50 dark:bg-background-dark/40 p-4 text-sm text-text-sub">
                    暂无修改说明
                </div>
            `;
            return;
        }

        releaseNotesList.innerHTML = notes.map(note => `
            <article class="rounded-xl border border-border-subtle dark:border-gray-700 bg-background-light/50 dark:bg-background-dark/40 p-4">
                <div class="flex items-center justify-between gap-3 mb-3">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-text-main dark:text-white">v${escapeHtml(note.version || '--')}</span>
                        <span class="text-xs text-text-sub">${escapeHtml(note.date || '')}</span>
                    </div>
                    <span class="inline-flex items-center rounded-full bg-secondary/10 px-2.5 py-1 text-[11px] font-bold text-secondary">更新说明</span>
                </div>
                <div class="space-y-2">
                    ${(note.items || []).map(item => `
                        <div class="flex items-start gap-2 text-sm text-text-main dark:text-gray-200">
                            <span class="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                            <span>${escapeHtml(item)}</span>
                        </div>
                    `).join('')}
                </div>
            </article>
        `).join('');
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
        $('#btn-ai-generate')?.addEventListener('click', showAiGenerateModal);
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
        ['#btn-sync-now-sidebar', '#btn-sync-now-settings'].forEach(selector => {
            $(selector)?.addEventListener('click', syncNow);
        });
        $('#btn-reset-settings')?.addEventListener('click', resetSettings);

        // 任务弹窗工具栏按钮
        $('#btn-priority')?.addEventListener('click', showPrioritySelector);
        $('#btn-tag')?.addEventListener('click', showTagSelector);
        $('#btn-time')?.addEventListener('click', showTimeSelector);
        $('#btn-repeat')?.addEventListener('click', showRepeatSelector);
        $('#btn-date')?.addEventListener('click', showDateSelector);
        $('#selected-tags-preview')?.addEventListener('click', handleSelectedTagsPreviewClick);

        // 标签管理页面
        $('#btn-add-tag')?.addEventListener('click', addTag);

        // 筛选菜单
        $('#btn-more')?.addEventListener('click', (e) => showFilterMenu(e));

        $('#btn-sort')?.addEventListener('click', () => {
            taskSortMode = taskSortMode === 'time' ? 'priority' : 'time';
            updateSortButton();
            renderTasks();
        });

        // 设置默认日期为今天
        const today = formatLocalDate();
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
                const tags = getSelectedTaskTags();
                const trimmedTag = tag.trim();
                if (!tags.includes(trimmedTag)) {
                    tags.push(trimmedTag);
                }
                setSelectedTaskTags(tags);
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
        showPickerModal('date', '设置任务日期', $('#input-task-date').value || formatLocalDate(), (date) => {
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

    // 从一段文字中解析任务，并在导入前让用户确认和编辑。
    function showAiGenerateModal() {
        const existingModal = document.getElementById('ai-generate-modal');
        if (existingModal) existingModal.remove();

        aiPreviewTasks = [];
        const apiKeyConfigured = settings.ai?.apiKeyConfigured === true;
        const modal = document.createElement('div');
        modal.id = 'ai-generate-modal';
        modal.className = 'ai-generate-modal';
        modal.innerHTML = `
            <div class="ai-modal-card" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
                <div class="ai-modal-header">
                    <div>
                        <h3 id="ai-modal-title" class="text-base font-bold text-text-main dark:text-white">✨ AI 智能生成待办</h3>
                        <p class="text-xs text-text-sub mt-1">粘贴聊天记录、会议纪要或工作安排，解析后可逐项确认。</p>
                    </div>
                    <button type="button" id="ai-close-btn" class="ai-modal-button ai-modal-button-secondary" aria-label="关闭">关闭</button>
                </div>
                <div class="ai-modal-body">
                    <label class="text-sm font-medium text-text-main dark:text-white" for="ai-source-text">待解析文本</label>
                    <textarea id="ai-source-text" class="ai-source-text mt-2" placeholder="例如：周三前完成项目方案，明天上午 10 点和产品确认需求；每周一整理周报。"></textarea>
                    <div class="ai-modal-actions">
                        <button type="button" id="ai-parse-btn" class="ai-modal-button ai-modal-button-primary">开始解析</button>
                    </div>
                    <p id="ai-modal-info" class="ai-modal-info"></p>
                    <div id="ai-modal-error" class="ai-modal-error hidden" role="alert"></div>
                    <div id="ai-preview-list" class="ai-preview-list"></div>
                </div>
                <div class="ai-modal-footer">
                    <span id="ai-import-summary" class="text-xs text-text-sub">解析后可选择要导入的任务</span>
                    <div class="flex gap-2">
                        <button type="button" id="ai-cancel-btn" class="ai-modal-button ai-modal-button-secondary">取消</button>
                        <button type="button" id="ai-import-btn" class="ai-modal-button ai-modal-button-primary" disabled>导入 0 项</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const sourceInput = modal.querySelector('#ai-source-text');
        const parseButton = modal.querySelector('#ai-parse-btn');
        const importButton = modal.querySelector('#ai-import-btn');
        const info = modal.querySelector('#ai-modal-info');
        const error = modal.querySelector('#ai-modal-error');
        const previewList = modal.querySelector('#ai-preview-list');
        const importSummary = modal.querySelector('#ai-import-summary');

        const closeModal = () => {
            aiPreviewTasks = [];
            modal.remove();
        };
        const showError = (message) => {
            error.textContent = message;
            error.classList.remove('hidden');
        };
        const clearError = () => {
            error.textContent = '';
            error.classList.add('hidden');
        };
        const updateImportButton = () => {
            const selectedCount = aiPreviewTasks.filter(task => task.selected).length;
            importButton.disabled = selectedCount === 0;
            importButton.textContent = `导入 ${selectedCount} 项`;
            importSummary.textContent = aiPreviewTasks.length
                ? `已解析 ${aiPreviewTasks.length} 项，已选择 ${selectedCount} 项`
                : '解析后可选择要导入的任务';
        };
        const renderPreview = () => {
            previewList.innerHTML = aiPreviewTasks.map((task, index) => `
                <article class="ai-preview-item">
                    <input type="checkbox" class="ai-preview-select" data-index="${index}" ${task.selected ? 'checked' : ''} aria-label="选择任务 ${index + 1}">
                    <div class="ai-preview-content">
                        <input type="text" class="ai-preview-field ai-preview-title" data-field="title" data-index="${index}" value="${escapeHtml(task.title || '')}" aria-label="任务标题">
                        <input type="date" class="ai-preview-field" data-field="date" data-index="${index}" value="${escapeHtml(task.date || '')}" aria-label="任务日期">
                        <input type="time" class="ai-preview-field" data-field="time" data-index="${index}" value="${escapeHtml(task.time || '')}" aria-label="任务时间">
                        <select class="ai-preview-field" data-field="priority" data-index="${index}" aria-label="任务优先级">
                            ${['高', '中', '低'].map(priority => `<option value="${priority}" ${task.priority === priority ? 'selected' : ''}>${priority}</option>`).join('')}
                        </select>
                        <p class="ai-preview-meta">${task.repeat || '不重复'} · ${task.tags?.length ? task.tags.map(tag => `#${escapeHtml(tag)}`).join(' ') : '无标签'}</p>
                    </div>
                </article>
            `).join('');
            updateImportButton();
        };

        if (!apiKeyConfigured) {
            info.textContent = '请先在设置中配置 AI 接口，再回来开始解析。';
            parseButton.disabled = true;
        } else {
            info.textContent = '解析过程会在本机主进程中完成，API Key 不会参与页面请求。';
        }

        modal.querySelector('#ai-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#ai-cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });

        parseButton.addEventListener('click', async () => {
            const sourceText = sourceInput.value.trim();
            if (!sourceText) {
                showError('请先粘贴需要解析的文字。');
                sourceInput.focus();
                return;
            }
            if (!window.electronAPI?.aiParseTasks) {
                showError('AI 生成功能只能在桌面应用中使用。');
                return;
            }

            clearError();
            parseButton.disabled = true;
            importButton.disabled = true;
            parseButton.textContent = '正在解析…';
            info.textContent = '正在解析文字，请稍候…';

            try {
                const result = await window.electronAPI.aiParseTasks(sourceText);
                if (result?.error) {
                    throw new Error(result.error);
                }
                aiPreviewTasks = (result?.tasks || []).map(task => ({ ...task, selected: true }));
                if (aiPreviewTasks.length === 0) {
                    info.textContent = '没有解析到明确的待办事项，可修改原文后重试。';
                    previewList.innerHTML = '';
                } else {
                    info.textContent = '请确认任务内容；标题、日期、时间和优先级均可修改。';
                    renderPreview();
                }
            } catch (parseError) {
                aiPreviewTasks = [];
                previewList.innerHTML = '';
                showError(parseError.message || '解析失败，请稍后重试。');
                updateImportButton();
            } finally {
                parseButton.disabled = false;
                parseButton.textContent = '开始解析';
            }
        });

        previewList.addEventListener('change', (event) => {
            const index = Number(event.target.dataset.index);
            if (!Number.isInteger(index) || !aiPreviewTasks[index]) return;

            if (event.target.classList.contains('ai-preview-select')) {
                aiPreviewTasks[index].selected = event.target.checked;
            } else if (event.target.dataset.field) {
                aiPreviewTasks[index][event.target.dataset.field] = event.target.value || null;
            }
            updateImportButton();
        });
        previewList.addEventListener('input', (event) => {
            const index = Number(event.target.dataset.index);
            if (event.target.dataset.field === 'title' && aiPreviewTasks[index]) {
                aiPreviewTasks[index].title = event.target.value;
            }
        });

        importButton.addEventListener('click', async () => {
            const selectedTasks = aiPreviewTasks
                .filter(task => task.selected && task.title?.trim())
                .map(({ selected, ...task }) => ({
                    ...task,
                    id: generateId(),
                    status: '待办',
                    createdAt: new Date().toISOString()
                }));
            if (selectedTasks.length === 0) {
                showError('请至少选择一项包含标题的任务。');
                return;
            }

            clearError();
            importButton.disabled = true;
            importButton.textContent = '正在导入…';
            try {
                if (window.electronAPI?.saveTasksBatch) {
                    tasks = await window.electronAPI.saveTasksBatch(selectedTasks);
                } else {
                    tasks.push(...selectedTasks);
                }
                renderTasks();
                updateProgress();
                if (currentView === 'calendar') renderCalendar();
                closeModal();
            } catch (saveError) {
                showError(saveError.message || '导入失败，请稍后重试。');
                updateImportButton();
            }
        });

        sourceInput.focus();
    }

    function getSelectedTaskTags() {
        const tagsInput = $('#input-task-tags');
        if (!tagsInput || !tagsInput.value) {
            return [];
        }

        return tagsInput.value
            .split(/[,，]/)
            .map(tag => tag.trim())
            .filter(tag => tag);
    }

    function setSelectedTaskTags(tags) {
        const tagsInput = $('#input-task-tags');
        if (!tagsInput) {
            return;
        }

        tagsInput.value = tags.join(', ');
    }

    function removeSelectedTaskTag(tagToRemove) {
        const nextTags = getSelectedTaskTags().filter(tag => tag !== tagToRemove);
        setSelectedTaskTags(nextTags);
        updateTagsPreview();
    }

    function handleSelectedTagsPreviewClick(e) {
        const removeBtn = e.target.closest('.btn-remove-selected-tag');
        if (!removeBtn || !removeBtn.dataset.tag) {
            return;
        }

        removeSelectedTaskTag(removeBtn.dataset.tag);
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
        const tags = getSelectedTaskTags();
        if (tags.length > 0) {
            tags.forEach(tag => {
                const escapedTag = escapeHtml(tag);
                html += `<div class="group flex h-7 shrink-0 items-center justify-center gap-x-1.5 rounded-md bg-tertiary/10 text-tertiary border-tertiary/20 pl-2 pr-2 border">
                    <span class="material-symbols-outlined text-[16px]">tag</span>
                    <span class="text-xs font-bold">${escapedTag}</span>
                    <button type="button" class="btn-remove-selected-tag inline-flex items-center justify-center rounded-sm text-tertiary/70 hover:text-tertiary transition-colors" data-tag="${escapedTag}" aria-label="删除标签 ${escapedTag}">
                        <span class="material-symbols-outlined text-[14px]">close</span>
                    </button>
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
        const aiBaseUrlInput = $('#input-ai-base-url');
        const aiApiKeyInput = $('#input-ai-api-key');
        const aiModelInput = $('#input-ai-model');
        const aiApiKeyHint = $('#ai-api-key-hint');

        if (obsidianPathInput) obsidianPathInput.value = settings.obsidianPath || '';
        if (syncTimeInput) syncTimeInput.value = settings.syncTime || '08:00';
        if (autoSyncToggle) autoSyncToggle.checked = settings.autoSync !== false;
        if (minimizeToggle) minimizeToggle.checked = settings.minimizeToTray !== false;
        if (startWindowsToggle) startWindowsToggle.checked = settings.startWithWindows === true;
        if (aiBaseUrlInput) aiBaseUrlInput.value = settings.ai?.baseUrl || 'https://api.deepseek.com';
        if (aiModelInput) aiModelInput.value = settings.ai?.model || 'deepseek-chat';
        if (aiApiKeyInput) {
            aiApiKeyInput.value = '';
            aiApiKeyInput.placeholder = settings.ai?.apiKeyConfigured
                ? '已配置（留空不会修改）'
                : '请输入 API Key';
        }
        if (aiApiKeyHint) {
            aiApiKeyHint.textContent = settings.ai?.apiKeyConfigured
                ? '已配置 API Key；如需替换，请输入新的 Key。'
                : '尚未配置 API Key。';
        }
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
            days.push(formatLocalDate(date));
        }

        // 按日期分组任务
        let html = '';
        days.forEach((dateStr, index) => {
            const dayTasks = tasks.filter(t => {
                const taskDate = t.date || formatLocalDate();
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
        const optionClass = (type, value) => `filter-option ${currentFilter.type === type && currentFilter.value === value ? 'active' : ''}`;
        const tagOptions = usedTags.map(tag =>
            `<button class="${optionClass('tag', tag)}" data-type="tag" data-value="${escapeHtml(tag)}">
                <span class="filter-icon material-symbols-outlined">tag</span>
                <span class="filter-label">${escapeHtml(tag)}</span>
            </button>`
        ).join('');

        const popup = document.createElement('div');
        popup.id = 'filter-popup';
        popup.className = 'filter-popup fixed z-[100]';
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.right = `${window.innerWidth - rect.right}px`;
        popup.innerHTML = `
            <div class="filter-section">
                <div class="filter-section-title">按优先级</div>
                <button class="${optionClass('priority', '高')}" data-type="priority" data-value="高">
                    <span class="priority-dot priority-dot-high"></span>
                    <span class="filter-label">高优先级</span>
                </button>
                <button class="${optionClass('priority', '中')}" data-type="priority" data-value="中">
                    <span class="priority-dot priority-dot-medium"></span>
                    <span class="filter-label">中优先级</span>
                </button>
                <button class="${optionClass('priority', '低')}" data-type="priority" data-value="低">
                    <span class="priority-dot priority-dot-low"></span>
                    <span class="filter-label">低优先级</span>
                </button>
            </div>
            <div class="filter-section">
                <div class="filter-section-title">按状态</div>
                <button class="${optionClass('status', '待办')}" data-type="status" data-value="待办">
                    <span class="filter-icon material-symbols-outlined">radio_button_unchecked</span>
                    <span class="filter-label">待办</span>
                </button>
                <button class="${optionClass('status', '完成')}" data-type="status" data-value="完成">
                    <span class="filter-icon material-symbols-outlined">check_circle</span>
                    <span class="filter-label">已完成</span>
                </button>
                <button class="${optionClass('status', '延迟')}" data-type="status" data-value="延迟">
                    <span class="filter-icon material-symbols-outlined">pending_actions</span>
                    <span class="filter-label">已延迟</span>
                </button>
            </div>
            ${usedTags.length > 0 ? `
                <div class="filter-section">
                    <div class="filter-section-title">按标签</div>
                    ${tagOptions}
                </div>
            ` : ''}
            <button id="filter-clear" class="filter-clear">
                <span class="filter-icon material-symbols-outlined">filter_alt_off</span>
                <span class="filter-label">清除筛选</span>
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

    function hasActiveTaskFilter() {
        return Boolean(currentFilter.type && currentFilter.value);
    }

    function getTodayTasks(baseTasks = tasks) {
        const today = formatLocalDate();
        return baseTasks.filter(task => {
            const taskDate = task.date || today;
            return taskDate === today;
        });
    }

    function applyCurrentTaskFilter(baseTasks) {
        if (currentFilter.type === 'tag' && currentFilter.value) {
            return baseTasks.filter(task =>
                task.tags && task.tags.includes(currentFilter.value)
            );
        }

        if (currentFilter.type === 'priority' && currentFilter.value) {
            return baseTasks.filter(task =>
                task.priority === currentFilter.value
            );
        }

        if (currentFilter.type === 'status' && currentFilter.value) {
            return baseTasks.filter(task =>
                task.status === currentFilter.value
            );
        }

        return baseTasks;
    }

    function getVisibleTodayTasks() {
        return applyCurrentTaskFilter(getTodayTasks());
    }

    // 更新排序按钮状态提示
    function updateSortButton() {
        const btn = $('#btn-sort');
        if (!btn) return;

        const byPriority = taskSortMode === 'priority';
        btn.title = byPriority ? '按优先级排序（点击切换为按时间）' : '按时间排序（点击切换为按优先级）';
        btn.classList.toggle('text-primary', byPriority);
        btn.classList.toggle('bg-primary/10', byPriority);
        btn.classList.toggle('text-text-sub', !byPriority);
    }

    // 渲染任务列表
    function renderTasks() {
        const taskList = $('#task-list');
        const emptyState = $('#empty-state');
        const allTodayTasks = getTodayTasks();
        let filteredTasks = getVisibleTodayTasks();

        if (filteredTasks.length === 0) {
            taskList.innerHTML = '';
            const emptyStateText = emptyState.querySelector('p');
            if (emptyStateText) {
                emptyStateText.textContent = hasActiveTaskFilter() && allTodayTasks.length > 0
                    ? '当前筛选条件下暂无任务'
                    : '暂无任务，点击上方按钮添加';
            }
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // 排序（默认按时间，可切换为按优先级）
        filteredTasks.sort((a, b) => {
            if (taskSortMode === 'priority') {
                const order = { '高': 0, '中': 1, '低': 2 };
                const diff = (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
                if (diff !== 0) return diff;
            }
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
        const todayTasks = getVisibleTodayTasks();
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
        const today = formatLocalDate();

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
                taskHtml += `<button type="button" class="calendar-more-btn" data-date="${dateStr}">+${dayTasks.length - 3} 更多</button>`;
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

        // 绑定“+N 更多”点击事件
        grid.querySelectorAll('.calendar-more-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDayTasksModal(btn.dataset.date);
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
            const dateStr = formatLocalDate(date);
            const isToday = dateStr === formatLocalDate(today);
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

    // 显示某一天全部任务的弹窗（日历“+N 更多”入口）
    function showDayTasksModal(dateStr) {
        const existingModal = document.getElementById('day-tasks-modal');
        if (existingModal) existingModal.remove();

        const date = new Date(dateStr + 'T00:00:00');
        const title = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
        const dayTasks = tasks.filter(t => t.date === dateStr);

        const modal = document.createElement('div');
        modal.id = 'day-tasks-modal';
        modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 border border-border-subtle dark:border-gray-700 overflow-hidden">
                <div class="px-5 pt-4 pb-3 border-b border-border-subtle dark:border-gray-700 flex items-center justify-between">
                    <h4 class="text-base font-bold text-text-main dark:text-white">${title}</h4>
                    <button id="day-tasks-close-btn" class="text-text-sub hover:text-text-main rounded-md p-1 transition-colors" aria-label="关闭">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <div class="px-3 py-3 overflow-y-auto space-y-2" style="max-height: 60vh;">
                    ${dayTasks.map(task => {
                        const dotColor = task.priority === '高' ? '#ef4444' : task.priority === '低' ? 'var(--tertiary)' : 'var(--secondary)';
                        return `
                            <div class="day-task-item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors" data-id="${task.id}">
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: ${dotColor}"></span>
                                <span class="flex-1 min-w-0 truncate text-sm font-medium ${task.status === '完成' ? 'line-through text-text-sub' : 'text-text-main'}">${escapeHtml(task.title)}</span>
                                ${task.time ? `<span class="text-xs font-mono text-text-sub shrink-0">${task.time}</span>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        modal.querySelector('#day-tasks-close-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        modal.querySelectorAll('.day-task-item').forEach(item => {
            item.addEventListener('click', () => {
                closeModal();
                editTask(item.dataset.id);
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
        $('#input-task-date').value = formatLocalDate();
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
        $('#input-task-date').value = task.date || formatLocalDate();
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
        const newApiKey = $('#input-ai-api-key')?.value.trim();
        const aiSettings = {
            baseUrl: $('#input-ai-base-url')?.value.trim() || 'https://api.deepseek.com',
            model: $('#input-ai-model')?.value.trim() || 'deepseek-chat'
        };
        if (newApiKey) {
            aiSettings.apiKey = newApiKey;
        }

        settings = {
            ...settings, // 保留其他现有设置
            obsidianPath: $('#input-obsidian-path')?.value || '',
            syncTime: $('#input-sync-time')?.value || '08:00',
            autoSync: $('#toggle-auto-sync')?.checked ?? true,
            minimizeToTray: $('#toggle-minimize-tray')?.checked ?? true,
            startWithWindows: $('#toggle-start-windows')?.checked ?? false,
            globalShortcut: settings.globalShortcut || 'Ctrl+Shift+O',
            userTags: existingUserTags,
            customColors: existingCustomColors,
            ai: aiSettings
        };

        if (window.electronAPI) {
            settings = await window.electronAPI.saveSettings(settings);
        }
        loadSettingsToUI();
        showSyncStatus('saved');
    }

    async function syncNow() {
        if (window.electronAPI) {
            showSyncStatus('syncing');
            await window.electronAPI.syncObsidian();
        }
    }

    function resetSettings() {
        $('#input-obsidian-path').value = '';
        $('#input-sync-time').value = '08:00';
        $('#toggle-auto-sync').checked = true;
        $('#toggle-minimize-tray').checked = true;
        $('#toggle-start-windows').checked = false;
        $('#input-ai-base-url').value = 'https://api.deepseek.com';
        $('#input-ai-model').value = 'deepseek-chat';
        $('#input-ai-api-key').value = '';
    }

    function showSyncStatus(type, detail) {
        const connectionStatus = $('#obsidian-connection-status');
        const sidebarLastSyncTime = $('#last-sync-time-sidebar');
        const settingsStatusTitle = $('#sync-status-title');
        const settingsLastSyncTime = $('#last-sync-time-settings');

        if (!connectionStatus && !settingsStatusTitle) return;

        if (type === 'success') {
            const timestamp = `最后同步: ${new Date(detail).toLocaleString('zh-CN')}`;
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-green-500">cloud_done</span>
                <span class="text-xs text-green-600 font-medium">已连接至 Obsidian</span>
            `;
            if (sidebarLastSyncTime) {
                sidebarLastSyncTime.classList.remove('hidden');
                sidebarLastSyncTime.textContent = timestamp;
            }
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 已连接';
            }
            if (settingsLastSyncTime) {
                settingsLastSyncTime.textContent = timestamp;
            }
        } else if (type === 'error') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-red-500">cloud_off</span>
                <span class="text-xs text-red-500">${detail || '同步失败'}</span>
            `;
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 同步失败';
            }
            if (settingsLastSyncTime) {
                settingsLastSyncTime.textContent = detail || '同步失败';
            }
        } else if (type === 'saved') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                <span class="text-xs text-primary font-medium">设置已保存</span>
            `;
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 设置已保存';
            }
        } else if (type === 'syncing') {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-primary animate-spin">sync</span>
                <span class="text-xs text-text-sub">正在同步...</span>
            `;
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 正在同步';
            }
            if (settingsLastSyncTime) {
                settingsLastSyncTime.textContent = '正在同步 Obsidian...';
            }
        }
    }

    // 更新 Obsidian 连接状态
    function updateObsidianConnectionStatus() {
        const connectionStatus = $('#obsidian-connection-status');
        const sidebarLastSyncTime = $('#last-sync-time-sidebar');
        const settingsStatusTitle = $('#sync-status-title');
        const settingsLastSyncTime = $('#last-sync-time-settings');

        if (!connectionStatus && !settingsStatusTitle) return;

        if (settings.obsidianPath) {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-green-500">cloud_done</span>
                <span class="text-xs text-green-600 font-medium">已连接至 Obsidian</span>
            `;
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 已连接';
            }
            if (sidebarLastSyncTime && settings.lastSyncTime) {
                sidebarLastSyncTime.classList.remove('hidden');
                sidebarLastSyncTime.textContent = `最后同步: ${new Date(settings.lastSyncTime).toLocaleString('zh-CN')}`;
            }
            if (settingsLastSyncTime) {
                settingsLastSyncTime.textContent = settings.lastSyncTime
                    ? `最后同步: ${new Date(settings.lastSyncTime).toLocaleString('zh-CN')}`
                    : '尚未同步';
            }
        } else {
            connectionStatus.innerHTML = `
                <span class="material-symbols-outlined text-[16px] text-gray-400">cloud_off</span>
                <span class="text-xs text-text-sub">未配置 Obsidian</span>
            `;
            if (sidebarLastSyncTime) sidebarLastSyncTime.classList.add('hidden');
            if (settingsStatusTitle) {
                settingsStatusTitle.textContent = '同步状态: 未配置';
            }
            if (settingsLastSyncTime) {
                settingsLastSyncTime.textContent = '请先配置 Obsidian 路径';
            }
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
                <div class="tag-add-card">
                    <span class="material-symbols-outlined tag-add-icon">add_circle</span>
                    <span class="tag-add-title">快速添加</span>
                </div>
            `;
            tagsList.querySelector('.tag-add-card')?.addEventListener('click', addTag);
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
                <div class="tag-card" data-tag="${escapeHtml(tagName)}">
                    <div class="tag-card-main">
                        <div class="tag-icon-box" style="background-color: ${tagColor}20">
                            <span class="tag-hash" style="color: ${tagColor}">#</span>
                        </div>
                        <div class="tag-card-copy">
                            <div class="tag-card-title-row">
                                <span class="tag-card-title">${escapeHtml(tagName)}</span>
                                <span class="tag-color-dot" style="background-color: ${tagColor}"></span>
                            </div>
                            <span class="tag-card-meta">${colorName}</span>
                        </div>
                    </div>
                    <div class="tag-card-actions">
                        <button class="btn-edit-tag tag-action-btn" data-tag="${escapeHtml(tagName)}" title="编辑标签">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="btn-delete-tag tag-action-btn tag-action-danger" data-tag="${escapeHtml(tagName)}" title="删除标签">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 添加快速添加卡片
        const quickAddHtml = `
            <div class="tag-add-card">
                <span class="material-symbols-outlined tag-add-icon">add_circle</span>
                <span class="tag-add-title">快速添加</span>
            </div>
        `;

        tagsList.innerHTML = tagsHtml + quickAddHtml;

        // 绑定快速添加
        tagsList.querySelector('.tag-add-card')?.addEventListener('click', addTag);

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
                const tagsArray = getSelectedTaskTags();
                if (!tagsArray.includes(tag)) {
                    tagsArray.push(tag);
                    setSelectedTaskTags(tagsArray);
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
