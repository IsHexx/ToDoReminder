const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initialClasses = []) {
    const classes = new Set(initialClasses);

    return {
        add: (...tokens) => tokens.forEach(token => classes.add(token)),
        remove: (...tokens) => tokens.forEach(token => classes.delete(token)),
        contains: (token) => classes.has(token),
        values: () => [...classes]
    };
}

function createRendererHarness() {
    const elements = {
        '#task-list': {
            innerHTML: '',
            querySelectorAll: () => []
        },
        '#empty-state': {
            classList: createClassList(['hidden']),
            querySelector: () => null
        },
        '#remaining-count': { textContent: '' },
        '#progress-percent': { textContent: '' },
        '#today-count': { textContent: '' },
        '#progress-circle': { style: {} },
        '#motivation-text': { textContent: '' }
    };

    const document = {
        querySelector: (selector) => elements[selector] || null,
        querySelectorAll: () => [],
        createElement: () => {
            let textContent = '';
            return {
                set textContent(value) {
                    textContent = String(value);
                    this.innerHTML = textContent
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                },
                get textContent() {
                    return textContent;
                },
                innerHTML: ''
            };
        },
        addEventListener: () => {}
    };

    const sourcePath = path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const instrumentedSource = source.replace(
        /document\.addEventListener\('DOMContentLoaded', init\);\s*\}\)\(\);/,
        "document.addEventListener('DOMContentLoaded', init);\n" +
        "globalThis.__testExports = {\n" +
        "    renderTasks,\n" +
        "    updateProgress,\n" +
        "    setTasks: (value) => { tasks = value; },\n" +
        "    setCurrentFilter: (value) => { currentFilter = value; }\n" +
        "};\n})();"
    );

    const context = vm.createContext({
        console,
        document,
        window: {},
        setTimeout,
        clearTimeout,
        Date,
        Math
    });

    new vm.Script(instrumentedSource, { filename: 'app.js' }).runInContext(context);

    return {
        api: context.__testExports,
        elements
    };
}

function formatToday(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

test('today summary stays aligned with the visible list when a filter is active', () => {
    const harness = createRendererHarness();
    const today = formatToday();

    harness.api.setTasks([
        {
            id: 'task-1',
            title: 'Visible only without filter',
            date: today,
            time: null,
            priority: '中',
            repeat: null,
            tags: [],
            status: '待办'
        }
    ]);
    harness.api.setCurrentFilter({ type: 'status', value: '完成' });

    harness.api.renderTasks();
    harness.api.updateProgress();

    assert.equal(harness.elements['#empty-state'].classList.contains('hidden'), false);
    assert.equal(harness.elements['#task-list'].innerHTML, '');
    assert.equal(harness.elements['#today-count'].textContent, 0);
    assert.equal(harness.elements['#remaining-count'].textContent, '剩余 0 个任务');
    assert.equal(harness.elements['#progress-percent'].textContent, '0%');
});
