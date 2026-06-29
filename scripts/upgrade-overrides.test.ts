/**
 * Unit tests for the PURE core of the upgrade-path overrides (P4).
 * Run: `npx tsx scripts/upgrade-overrides.test.ts`
 *
 * Covers resolveUpgrade (precedence) and validateOverrides (fail-loud shape
 * checks). The file IO (loadUpgradeOverrides) is exercised by the CLI.
 */
import * as assert from 'assert';
import { resolveUpgrade, validateOverrides } from './upgrade-overrides';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// --- resolveUpgrade ----------------------------------------------------------

test('null overrides (file absent) => stub, consulted false', () => {
    const r = resolveUpgrade(null, '0.3261.0');
    assert.deepStrictEqual(r, {
        minPreviousVersion: null,
        requiredStop: false,
        note: null,
        consulted: false,
    });
});

test('present file, version with no entry => default applied, consulted true', () => {
    const r = resolveUpgrade({ default: { minPreviousVersion: '0.3000.0' }, versions: {} }, '0.3261.0');
    assert.strictEqual(r.consulted, true);
    assert.strictEqual(r.minPreviousVersion, '0.3000.0');
    assert.strictEqual(r.requiredStop, false);
    assert.strictEqual(r.note, null);
});

test('version-specific entry wins over default (most specific wins)', () => {
    const r = resolveUpgrade(
        {
            default: { minPreviousVersion: '0.3000.0', requiredStop: false, note: 'base' },
            versions: { '0.3300.0': { requiredStop: true, note: 'stop here' } },
        },
        '0.3300.0',
    );
    assert.strictEqual(r.requiredStop, true);
    assert.strictEqual(r.note, 'stop here');
    // unspecified field falls through to default
    assert.strictEqual(r.minPreviousVersion, '0.3000.0');
});

test('empty overrides object => stub values but consulted true', () => {
    const r = resolveUpgrade({}, '0.3261.0');
    assert.strictEqual(r.consulted, true);
    assert.strictEqual(r.requiredStop, false);
    assert.strictEqual(r.minPreviousVersion, null);
});

// --- validateOverrides (fail loud) -------------------------------------------

const throws = (fn: () => void, re: RegExp): void => assert.throws(fn, re);

test('accepts a valid version-keyed file', () => {
    const ok = validateOverrides({
        $schema: './x.json',
        default: { minPreviousVersion: null, requiredStop: false, note: null },
        versions: { '0.3300.0': { requiredStop: true, note: 'x' } },
    });
    assert.ok(ok.versions?.['0.3300.0']);
});

test('rejects a non-object root', () => throws(() => validateOverrides([]), /must be a JSON object/));
test('rejects an unknown top-level field', () => throws(() => validateOverrides({ verisons: {} }), /unknown top-level field/));
test('rejects an unknown block field (e.g. requireStop typo)', () =>
    throws(() => validateOverrides({ versions: { '0.3300.0': { requireStop: true } } }), /unknown field "requireStop"/));
test('rejects a wrong-typed requiredStop', () =>
    throws(() => validateOverrides({ versions: { '0.3300.0': { requiredStop: 'yes' } } }), /requiredStop must be a boolean/));
test('rejects a wrong-typed minPreviousVersion', () =>
    throws(() => validateOverrides({ default: { minPreviousVersion: 3 } }), /minPreviousVersion must be a string or null/));
test('rejects a non-object versions map', () =>
    throws(() => validateOverrides({ versions: [] }), /versions must be an object/));

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
