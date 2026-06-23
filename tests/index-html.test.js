const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('renderer HTML does not contain duplicate ids', () => {
    const htmlPath = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const idMatches = [...html.matchAll(/\sid="([^"]+)"/g)];
    const counts = new Map();

    for (const [, id] of idMatches) {
        counts.set(id, (counts.get(id) || 0) + 1);
    }

    const duplicates = [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([id]) => id);

    assert.deepEqual(duplicates, []);
});

test('renderer shell does not depend on remote style resources', () => {
    const htmlPath = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
    assert.doesNotMatch(html, /fonts\.googleapis\.com/);
    assert.doesNotMatch(html, /fonts\.gstatic\.com/);
});

test('local stylesheet includes modal max-width utilities used by picker dialogs', () => {
    const cssPath = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'main.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.match(css, /\.max-w-sm\s*\{/);
    assert.match(css, /\.max-w-xs\s*\{/);
});

test('material icon fallbacks do not render navigation icons as empty squares', () => {
    const appJsPath = path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js');
    const appJs = fs.readFileSync(appJsPath, 'utf8');

    assert.doesNotMatch(appJs, /calendar_month:\s*['"]□['"]/);
    assert.doesNotMatch(appJs, /calendar_today:\s*['"]□['"]/);
    assert.doesNotMatch(appJs, /today:\s*['"]□['"]/);
    assert.doesNotMatch(appJs, /upcoming:\s*['"]□['"]/);
});

test('filter menu uses dedicated polished component classes', () => {
    const appJsPath = path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js');
    const cssPath = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'main.css');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.match(appJs, /filter-popup/);
    assert.match(appJs, /filter-section-title/);
    assert.match(appJs, /filter-option/);
    assert.match(appJs, /active/);
    assert.match(css, /\.filter-popup\s*\{/);
    assert.match(css, /\.filter-option\.active\s*\{/);
});

test('tag management uses dedicated card action classes', () => {
    const appJsPath = path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js');
    const cssPath = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'main.css');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.match(appJs, /tag-card-actions/);
    assert.match(appJs, /tag-action-btn/);
    assert.match(appJs, /tag-add-card/);
    assert.match(css, /\.tag-card-actions\s*\{/);
    assert.match(css, /\.tag-action-btn\s*\{/);
    assert.match(css, /\.tag-add-card\s*\{/);
});

test('local stylesheet includes high-risk utility classes used by renderer pages', () => {
    const cssPath = path.join(__dirname, '..', 'src', 'renderer', 'styles', 'main.css');
    const css = fs.readFileSync(cssPath, 'utf8').replace(/\\/g, '');
    const requiredUtilities = [
        'text-left',
        'max-h-60',
        'ring-2',
        'ring-offset-2',
        'ring-primary',
        'bg-border-subtle',
        'flex-shrink-0',
        'p-0\\.5',
        'pl-7',
        'gap-2\\.5'
    ];

    for (const utility of requiredUtilities) {
        assert.match(css, new RegExp(`\\.${utility.replace(/\\\\/g, '')}\\s*\\{`));
    }
});
