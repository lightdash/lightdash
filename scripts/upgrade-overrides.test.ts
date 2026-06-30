/**
 * Unit tests for the PURE core of the upgrade-path overrides (P4).
 * Run: `npx tsx scripts/upgrade-overrides.test.ts`
 *
 * Covers resolveUpgrade (precedence) and validateOverrides (fail-loud shape
 * checks). The file IO (loadUpgradeOverrides) is exercised by the CLI.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    carriedUpgradeFloor,
    loadUpgradeOverrides,
    recordDerivedFloor,
    resolveUpgrade,
    validateOverrides,
} from './upgrade-overrides';

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

// --- carriedUpgradeFloor (forward-carried high-water mark) --------------------

test('null overrides => no carried floor', () => {
    assert.deepStrictEqual(carriedUpgradeFloor(null, '0.3300.0'), {
        minPreviousVersion: null,
        sourceVersion: null,
        kind: null,
    });
});

test('empty overrides => no carried floor', () => {
    assert.strictEqual(carriedUpgradeFloor({}, '0.3300.0').minPreviousVersion, null);
});

test('default floor applies to any release', () => {
    const f = carriedUpgradeFloor({ default: { minPreviousVersion: '0.3000.0' } }, '0.3300.0');
    assert.strictEqual(f.minPreviousVersion, '0.3000.0');
    assert.strictEqual(f.kind, 'default');
});

test('THE version-skip case: a floor declared at an EARLIER release is carried forward', () => {
    // 0.3265.0 dropped a column (safe from 0.3260.0 onward). Target 0.3300.0 is
    // itself clean, but jumping to it from before 0.3260.0 still crosses the drop.
    const f = carriedUpgradeFloor(
        { versions: { '0.3265.0': { minPreviousVersion: '0.3260.0' } } },
        '0.3300.0',
    );
    assert.strictEqual(f.minPreviousVersion, '0.3260.0');
    assert.strictEqual(f.sourceVersion, '0.3265.0');
    assert.strictEqual(f.kind, 'minPrevious');
});

test('a floor declared at a LATER release does not apply to an earlier target', () => {
    const f = carriedUpgradeFloor(
        { versions: { '0.3400.0': { minPreviousVersion: '0.3390.0' } } },
        '0.3300.0',
    );
    assert.strictEqual(f.minPreviousVersion, null);
});

test('a required stop at an earlier release is itself a floor (= that stop)', () => {
    const f = carriedUpgradeFloor(
        { versions: { '0.3280.0': { requiredStop: true } } },
        '0.3300.0',
    );
    assert.strictEqual(f.minPreviousVersion, '0.3280.0');
    assert.strictEqual(f.sourceVersion, '0.3280.0');
    assert.strictEqual(f.kind, 'requiredStop');
});

test("a release's OWN required stop does not floor itself", () => {
    const f = carriedUpgradeFloor(
        { versions: { '0.3300.0': { requiredStop: true } } },
        '0.3300.0',
    );
    assert.strictEqual(f.minPreviousVersion, null);
});

test('the highest (most restrictive) floor wins across mixed sources', () => {
    const f = carriedUpgradeFloor(
        {
            default: { minPreviousVersion: '0.3000.0' },
            versions: {
                '0.3265.0': { minPreviousVersion: '0.3260.0' },
                '0.3280.0': { requiredStop: true }, // floor 0.3280.0 — the highest
            },
        },
        '0.3300.0',
    );
    assert.strictEqual(f.minPreviousVersion, '0.3280.0');
    assert.strictEqual(f.kind, 'requiredStop');
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

// --- recordDerivedFloor (IO: persist a floor for future releases) ------------

let tmpSeq = 0;
const withTmpOverrides = (initial: string | null, fn: (p: string) => void): void => {
    tmpSeq += 1;
    const p = path.join(os.tmpdir(), `rs-overrides-${process.pid}-${tmpSeq}.json`);
    try {
        if (initial !== null) fs.writeFileSync(p, initial);
        fn(p);
    } finally {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }
};

test('recordDerivedFloor writes a new version floor; preserves $schema, default, siblings', () => {
    withTmpOverrides(
        JSON.stringify({
            $schema: './scripts/release-safety-overrides.schema.json',
            default: { minPreviousVersion: null, requiredStop: false, note: null },
            versions: { '0.3265.0': { minPreviousVersion: '0.3260.0' } },
        }),
        (p) => {
            const wrote = recordDerivedFloor(p, '0.3300.0', '0.3290.0');
            assert.strictEqual(wrote, true);
            const reloaded = loadUpgradeOverrides(p)!;
            assert.strictEqual(reloaded.versions?.['0.3300.0']?.minPreviousVersion, '0.3290.0');
            // sibling + default + $schema survive
            assert.strictEqual(reloaded.versions?.['0.3265.0']?.minPreviousVersion, '0.3260.0');
            assert.strictEqual(reloaded.default?.requiredStop, false);
            assert.ok((reloaded as { $schema?: string }).$schema);
            // and the carried floor now sees the recorded entry
            assert.strictEqual(carriedUpgradeFloor(reloaded, '0.3400.0').minPreviousVersion, '0.3290.0');
        },
    );
});

test('recordDerivedFloor is write-if-absent: never clobbers a declared floor', () => {
    withTmpOverrides(
        JSON.stringify({ versions: { '0.3300.0': { minPreviousVersion: '0.3200.0', note: 'human' } } }),
        (p) => {
            const wrote = recordDerivedFloor(p, '0.3300.0', '0.3290.0');
            assert.strictEqual(wrote, false);
            const reloaded = loadUpgradeOverrides(p)!;
            assert.strictEqual(reloaded.versions?.['0.3300.0']?.minPreviousVersion, '0.3200.0'); // unchanged
            assert.strictEqual(reloaded.versions?.['0.3300.0']?.note, 'human');
        },
    );
});

test('recordDerivedFloor creates a valid file when none exists', () => {
    withTmpOverrides(null, (p) => {
        const wrote = recordDerivedFloor(p, '0.3300.0', '0.3290.0');
        assert.strictEqual(wrote, true);
        const reloaded = loadUpgradeOverrides(p)!;
        assert.strictEqual(reloaded.versions?.['0.3300.0']?.minPreviousVersion, '0.3290.0');
    });
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
