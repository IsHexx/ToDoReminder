const REQUEST_TIMEOUT_MS = 60 * 1000;

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildSystemPrompt(today = formatLocalDate()) {
    return `你是待办事项整理助手。今天是 ${today}。
请从用户提供的聊天记录、会议纪要或工作安排中提取明确可执行的待办事项。
只输出 JSON，不要输出 Markdown、解释或代码围栏。优先输出 JSON 数组；如果接口要求 JSON 对象，则使用 {"tasks":[...]}。
每一项必须遵循以下结构：
{
  "title": "简洁的任务标题",
  "date": "YYYY-MM-DD 或 null",
  "time": "HH:MM 或 null",
  "priority": "高、 中 或 低",
  "tags": ["标签"],
  "repeat": "每天、每周、每月 或 null"
}
没有明确日期或时间时使用 null；不要编造任务。`;
}

function stripJsonFence(text) {
    return String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function extractBalancedJson(text, startIndex) {
    const opening = text[startIndex];
    const closing = opening === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === opening) {
            depth += 1;
        } else if (char === closing) {
            depth -= 1;
            if (depth === 0) {
                return text.slice(startIndex, index + 1);
            }
        }
    }

    return null;
}

function extractJson(text) {
    const cleaned = stripJsonFence(text);
    if (!cleaned) {
        throw new Error('AI 未返回可解析的内容');
    }

    try {
        return JSON.parse(cleaned);
    } catch (_) {
        // 某些兼容接口会在 JSON 前后附上说明文字，继续提取首个完整对象或数组。
    }

    for (let index = 0; index < cleaned.length; index += 1) {
        if (cleaned[index] !== '[' && cleaned[index] !== '{') {
            continue;
        }

        const candidate = extractBalancedJson(cleaned, index);
        if (!candidate) {
            continue;
        }

        try {
            return JSON.parse(candidate);
        } catch (_) {
            // 继续寻找下一个 JSON 起点。
        }
    }

    throw new Error('AI 返回内容不是有效 JSON');
}

function getTaskArray(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('AI 返回的任务格式不正确');
    }

    for (const key of ['tasks', 'data', 'items', 'todos']) {
        if (Array.isArray(parsed[key])) {
            return parsed[key];
        }
    }

    const firstArray = Object.values(parsed).find(value => Array.isArray(value));
    if (firstArray) {
        return firstArray;
    }

    throw new Error('AI 返回的任务列表为空或格式不正确');
}

function cleanDate(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? `${yearText}-${monthText}-${dayText}`
        : null;
}

function cleanTime(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return null;
    }

    return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function cleanPriority(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['高', '紧急', 'high', 'urgent', '高优先级'].includes(normalized)) {
        return '高';
    }
    if (['低', 'low', '低优先级'].includes(normalized)) {
        return '低';
    }
    return '中';
}

function cleanTags(value) {
    const source = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(/[,，、]/)
            : [];
    const seen = new Set();

    return source
        .map(tag => String(tag || '').trim().replace(/^#/, ''))
        .filter(tag => tag && !seen.has(tag) && seen.add(tag));
}

function cleanRepeat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const mapping = {
        '每天': '每天',
        daily: '每天',
        '每周': '每周',
        weekly: '每周',
        '每月': '每月',
        monthly: '每月'
    };
    return mapping[normalized] || null;
}

function cleanTask(task) {
    if (!task || typeof task !== 'object') {
        return null;
    }

    const title = typeof task.title === 'string' ? task.title.trim() : '';
    if (!title) {
        return null;
    }

    return {
        title,
        date: cleanDate(task.date),
        time: cleanTime(task.time),
        priority: cleanPriority(task.priority),
        tags: cleanTags(task.tags),
        repeat: cleanRepeat(task.repeat)
    };
}

function cleanTasks(parsed) {
    return getTaskArray(parsed).map(cleanTask).filter(Boolean);
}

function getChatContent(responseBody) {
    const content = responseBody?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
        return content;
    }
    throw new Error('AI 接口未返回解析结果');
}

async function requestCompletion(endpoint, headers, messages, includeResponseFormat, signal) {
    const payload = {
        model: messages.model,
        messages: messages.items,
        temperature: 0.2
    };
    if (includeResponseFormat) {
        payload.response_format = { type: 'json_object' };
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
    });
    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
        const detail = String(responseBody?.error?.message || responseBody?.message || '').trim();
        const error = new Error(detail || `请求失败（HTTP ${response.status}）`);
        error.status = response.status;
        throw error;
    }

    return getChatContent(responseBody);
}

async function parseTextToTasks(text, aiConfig = {}, today = formatLocalDate()) {
    const sourceText = String(text || '').trim();
    if (!sourceText) {
        throw new Error('请先粘贴需要解析的文字');
    }

    const apiKey = String(aiConfig.apiKey || '').trim();
    if (!apiKey) {
        throw new Error('请先在设置中配置 AI 接口的 API Key');
    }

    const baseUrl = String(aiConfig.baseUrl || '').trim().replace(/\/+$/, '');
    const model = String(aiConfig.model || '').trim();
    if (!baseUrl || !model) {
        throw new Error('请先在设置中配置 AI 接口地址和模型名');
    }

    let endpoint;
    try {
        endpoint = new URL(`${baseUrl}/chat/completions`).toString();
    } catch (_) {
        throw new Error('AI 接口地址无效，请检查 Base URL');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
    };
    const messages = {
        model,
        items: [
            { role: 'system', content: buildSystemPrompt(today) },
            { role: 'user', content: sourceText }
        ]
    };

    try {
        let content;
        try {
            content = await requestCompletion(endpoint, headers, messages, true, controller.signal);
        } catch (error) {
            // DeepSeek/OpenAI 等支持 response_format；部分 OpenAI 兼容服务会拒绝该字段。
            if (![400, 422].includes(error.status) || controller.signal.aborted) {
                throw error;
            }
            content = await requestCompletion(endpoint, headers, messages, false, controller.signal);
        }
        return cleanTasks(extractJson(content));
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('AI 解析请求超时，请稍后重试');
        }
        if (error.status) {
            throw new Error(`AI 接口请求失败：${error.message}`);
        }
        if (error instanceof TypeError) {
            throw new Error('网络请求失败，请检查网络和 AI 接口地址');
        }
        if (error.message?.startsWith('AI ') || error.message?.startsWith('请先')) {
            throw error;
        }
        throw new Error(`AI 解析失败：${error.message || '返回内容无法解析'}`);
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    buildSystemPrompt,
    cleanDate,
    cleanPriority,
    cleanRepeat,
    cleanTags,
    cleanTask,
    cleanTasks,
    cleanTime,
    extractJson,
    formatLocalDate,
    parseTextToTasks,
    stripJsonFence
};
