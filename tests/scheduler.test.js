const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldRunAutoSync } = require('../src/main/scheduler');

test('scheduled auto sync runs when enabled at the configured minute', () => {
    assert.equal(
        shouldRunAutoSync(
            { autoSync: true, syncTime: '08:00' },
            '08:00',
            '2026-06-22'
        ),
        true
    );
});

test('scheduled auto sync does not run more than once per local day', () => {
    assert.equal(
        shouldRunAutoSync(
            { autoSync: true, syncTime: '08:00', lastAutoSyncDate: '2026-06-22' },
            '08:00',
            '2026-06-22'
        ),
        false
    );
});

test('scheduled auto sync respects disabled and mismatched time settings', () => {
    assert.equal(
        shouldRunAutoSync(
            { autoSync: false, syncTime: '08:00' },
            '08:00',
            '2026-06-22'
        ),
        false
    );

    assert.equal(
        shouldRunAutoSync(
            { autoSync: true, syncTime: '08:00' },
            '08:01',
            '2026-06-22'
        ),
        false
    );
});
