const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createRendererHarness() {
    const elements = {
        '#selected-tags-preview': {
            innerHTML: '',
            addEventListener: () => {}
        },
        '#input-task-tags': { value: '' },
        '#select-task-priority': { value: '中' },
        '#input-task-time': { value: '' },
        '#select-task-repeat': { value: '' }
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
        "    updateTagsPreview,\n" +
        "    removeSelectedTaskTag: typeof removeSelectedTaskTag === 'function' ? removeSelectedTaskTag : undefined\n" +
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

test('selected tag pills render a remove button', () => {
    const harness = createRendererHarness();
    harness.elements['#input-task-tags'].value = '工作, 学习';

    harness.api.updateTagsPreview();

    assert.match(harness.elements['#selected-tags-preview'].innerHTML, /btn-remove-selected-tag/);
    assert.match(harness.elements['#selected-tags-preview'].innerHTML, /data-tag="工作"/);
});

test('removing a selected tag updates the hidden input value', () => {
    const harness = createRendererHarness();
    harness.elements['#input-task-tags'].value = '工作, 学习';

    assert.equal(typeof harness.api.removeSelectedTaskTag, 'function');

    harness.api.removeSelectedTaskTag('工作');

    assert.equal(harness.elements['#input-task-tags'].value, '学习');
});
