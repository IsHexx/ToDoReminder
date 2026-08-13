const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('AI quick input is exposed through a dedicated global shortcut', () => {
    const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

    assert.match(main, /AI_QUICK_INPUT_SHORTCUT\s*=\s*'Ctrl\+Shift\+I'/);
    assert.match(main, /globalShortcut\.register\(AI_QUICK_INPUT_SHORTCUT/);
    assert.match(main, /width:\s*720/);
    assert.match(main, /height:\s*560/);
});

test('quick input can parse a description and batch import confirmed AI tasks', () => {
    const quickInput = fs.readFileSync(path.join(root, 'src', 'renderer', 'quickInput.html'), 'utf8');

    assert.match(quickInput, /id="btn-ai-generate"/);
    assert.match(quickInput, /Ctrl\+Enter/);
    assert.match(quickInput, /aiParseTasks\(description\)/);
    assert.match(quickInput, /id="btn-ai-import"/);
    assert.match(quickInput, /saveTasksBatch\(selectedTasks\)/);
});
