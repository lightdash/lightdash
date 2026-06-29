/**
 * Unit tests for the PURE core of the release-safety generator.
 * Run: `npx tsx scripts/gen-release-safety.test.ts`
 *
 * Self-contained (node:assert) so it does not depend on the jest project config.
 */
import * as assert from 'assert';
import {
    buildMarker,
    detectMigrations,
    GitChange,
    MARKER_SCHEMA_VERSION,
} from './gen-release-safety';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (err) {
        failures.push(
            `${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

const CORE = 'packages/backend/src/database/migrations';
const EE = 'packages/backend/src/ee/database/migrations';
const change = (status: string, p: string): GitChange => ({ status, path: p });

// --- detectMigrations --------------------------------------------------------

test('counts only ADDED timestamped migration files', () => {
    const res = detectMigrations([
        change('A', `${CORE}/20260628120000_add_thing.ts`),
        change('A', `${CORE}/20260628130000_add_other.ts`),
    ]);
    assert.strictEqual(res.present, true);
    assert.strictEqual(res.count, 2);
    assert.deepStrictEqual(res.files, [
        '20260628120000_add_thing.ts',
        '20260628130000_add_other.ts',
    ]);
    assert.strictEqual(res.ee, false);
});

test('does NOT count modified/renamed/copied historical migrations', () => {
    const res = detectMigrations([
        change('M', `${CORE}/20210713230243_users.ts`),
        change('R100', `${CORE}/20210713230243_users.ts`),
        change('C75', `${CORE}/20210713230243_users.ts`),
    ]);
    assert.strictEqual(res.present, false);
    assert.strictEqual(res.count, 0);
});

test('records deleted historical migrations as a warning, not a count', () => {
    const res = detectMigrations([
        change('D', `${CORE}/20210713230243_users.ts`),
    ]);
    assert.strictEqual(res.present, false);
    assert.strictEqual(res.count, 0);
    assert.deepStrictEqual(res.deletedHistorical, ['20210713230243_users.ts']);
});

test('ee flag true iff an added file is under the ee migrations dir', () => {
    assert.strictEqual(
        detectMigrations([change('A', `${EE}/20260628120000_x.ts`)]).ee,
        true,
    );
    assert.strictEqual(
        detectMigrations([change('A', `${CORE}/20260628120000_x.ts`)]).ee,
        false,
    );
});

test('core + ee counts reconcile to total', () => {
    const res = detectMigrations([
        change('A', `${CORE}/20260628120000_core.ts`),
        change('A', `${EE}/20260628130000_ee.ts`),
    ]);
    assert.strictEqual(res.count, 2);
    assert.strictEqual(res.ee, true);
});

test('ignores non-migration files and non-timestamped names', () => {
    const res = detectMigrations([
        change('A', `${CORE}/README.md`),
        change('A', `${CORE}/helpers.ts`),
        change('A', `${CORE}/notatimestamp_x.ts`),
    ]);
    assert.strictEqual(res.present, false);
    assert.strictEqual(res.count, 0);
});

test('accepts compiled .js migration filenames too', () => {
    const res = detectMigrations([
        change('A', `${CORE}/20260628120000_add_thing.js`),
    ]);
    assert.strictEqual(res.count, 1);
});

// --- buildMarker honesty rules -----------------------------------------------

const base = {
    version: '0.3261.0',
    previousVersion: '0.3260.2',
    releaseDate: '2026-06-29T00:00:00.000Z',
};

test('migration-bearing release => rollingUpdateSafe "unknown", Recreate', () => {
    const m = buildMarker({
        ...base,
        migrations: {
            present: true,
            count: 1,
            files: ['x.ts'],
            ee: false,
            deletedHistorical: [],
        },
    });
    assert.strictEqual(m.compatibility.rollingUpdateSafe, 'unknown');
    assert.strictEqual(m.compatibility.recommendedStrategy, 'Recreate');
    assert.notStrictEqual(m.compatibility.rollingUpdateSafe, false); // never silently false
});

test('no-migration release => rollingUpdateSafe true, RollingUpdate', () => {
    const m = buildMarker({
        ...base,
        migrations: {
            present: false,
            count: 0,
            files: [],
            ee: false,
            deletedHistorical: [],
        },
    });
    assert.strictEqual(m.compatibility.rollingUpdateSafe, true);
    assert.strictEqual(m.compatibility.recommendedStrategy, 'RollingUpdate');
});

test('first release (null migrations) => present "unknown", never claims safe', () => {
    const m = buildMarker({
        version: '0.0.1',
        previousVersion: null,
        releaseDate: base.releaseDate,
        migrations: null,
    });
    assert.strictEqual(m.migrations.present, 'unknown');
    assert.strictEqual(m.compatibility.rollingUpdateSafe, 'unknown');
    assert.strictEqual(m.previousVersion, null);
});

test('marker shape: schemaVersion, capabilities, api unchecked stubs', () => {
    const m = buildMarker({
        ...base,
        migrations: {
            present: true,
            count: 1,
            files: ['x.ts'],
            ee: false,
            deletedHistorical: [],
        },
    });
    assert.strictEqual(m.schemaVersion, MARKER_SCHEMA_VERSION);
    assert.deepStrictEqual(m.capabilities, ['migrations']);
    assert.strictEqual(m.api.rest.checked, false);
    assert.strictEqual(m.api.mcp.checked, false);
    assert.strictEqual(m.upgrade.requiredStop, false);
    assert.strictEqual(m.upgrade.minPreviousVersion, null);
});

test('notes always disclose the blind spot', () => {
    const m = buildMarker({
        ...base,
        migrations: {
            present: false,
            count: 0,
            files: [],
            ee: false,
            deletedHistorical: [],
        },
    });
    assert.ok(/does NOT/i.test(m.compatibility.notes));
});

// --- aiReview override (P6) --------------------------------------------------

test('aiReview flips a migration-bearing release to its verdict + adds capability', () => {
    const m = buildMarker({
        ...base,
        migrations: { present: true, count: 1, files: ['x.ts'], ee: false, deletedHistorical: [] },
        aiReview: {
            rollingUpdateSafe: true,
            recommendedStrategy: 'RollingUpdate',
            summary: 'All migrations additive; verified old code unaffected.',
        },
    });
    assert.strictEqual(m.compatibility.rollingUpdateSafe, true);
    assert.strictEqual(m.compatibility.recommendedStrategy, 'RollingUpdate');
    assert.deepStrictEqual(m.capabilities, ['migrations', 'ai-review']);
    assert.ok(/AI migration review:/.test(m.compatibility.notes));
});

test('aiReview "breaking" verdict sets rollingUpdateSafe false', () => {
    const m = buildMarker({
        ...base,
        migrations: { present: true, count: 1, files: ['x.ts'], ee: false, deletedHistorical: [] },
        aiReview: {
            rollingUpdateSafe: false,
            recommendedStrategy: 'Recreate',
            summary: 'Drops a column the old code still reads.',
        },
    });
    assert.strictEqual(m.compatibility.rollingUpdateSafe, false);
    assert.strictEqual(m.compatibility.recommendedStrategy, 'Recreate');
});

test('aiReview is ignored on a no-migration release (never invents a verdict)', () => {
    const m = buildMarker({
        ...base,
        migrations: { present: false, count: 0, files: [], ee: false, deletedHistorical: [] },
        aiReview: {
            rollingUpdateSafe: false,
            recommendedStrategy: 'Recreate',
            summary: 'should be ignored',
        },
    });
    assert.strictEqual(m.compatibility.rollingUpdateSafe, true); // base no-migration value
    assert.deepStrictEqual(m.capabilities, ['migrations']);
});

// --- report ------------------------------------------------------------------

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
