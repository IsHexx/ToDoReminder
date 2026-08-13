const test = require('node:test');
const assert = require('node:assert/strict');
const {
    cleanTasks,
    extractJson,
    parseTextToTasks,
    stripJsonFence
} = require('../src/main/ai');

test('AI response extraction accepts fenced JSON with surrounding text', () => {
    const parsed = extractJson('解析结果如下：\n```json\n{"tasks":[{"title":"整理会议纪要"}]}\n```');
    assert.deepEqual(parsed, { tasks: [{ title: '整理会议纪要' }] });
    assert.equal(stripJsonFence('```json\n[]\n```'), '[]');
});

test('AI task cleaning drops empty titles and normalizes invalid fields', () => {
    const tasks = cleanTasks({
        tasks: [
            {
                title: '  明天确认需求  ',
                date: '2026-02-30',
                time: '9:05',
                priority: 'urgent',
                tags: '工作，#需求，工作',
                repeat: 'weekly'
            },
            { title: '   ', date: '2026-08-12' }
        ]
    });

    assert.deepEqual(tasks, [{
        title: '明天确认需求',
        date: null,
        time: '09:05',
        priority: '高',
        tags: ['工作', '需求'],
        repeat: '每周'
    }]);
});

test('AI parsing retries without response_format for compatible providers that reject it', async () => {
    const originalFetch = global.fetch;
    const requestBodies = [];
    global.fetch = async (url, options) => {
        requestBodies.push(JSON.parse(options.body));
        if (requestBodies.length === 1) {
            return {
                ok: false,
                status: 400,
                json: async () => ({ error: { message: 'response_format is not supported' } })
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{
                    message: {
                        content: '[{"title":"发送周报","date":"2026-08-12","time":null,"priority":"中","tags":[],"repeat":null}]'
                    }
                }]
            })
        };
    };

    try {
        const tasks = await parseTextToTasks('今天发送周报', {
            baseUrl: 'https://example.test/v1',
            apiKey: 'test-key',
            model: 'test-model'
        }, '2026-08-12');

        assert.equal(requestBodies.length, 2);
        assert.deepEqual(requestBodies[0].response_format, { type: 'json_object' });
        assert.equal(requestBodies[1].response_format, undefined);
        assert.deepEqual(tasks, [{
            title: '发送周报',
            date: '2026-08-12',
            time: null,
            priority: '中',
            tags: [],
            repeat: null
        }]);
    } finally {
        global.fetch = originalFetch;
    }
});
