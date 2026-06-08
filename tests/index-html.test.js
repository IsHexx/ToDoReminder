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
