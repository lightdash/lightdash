/**
 * Unit tests for the PURE core of expand-version detection (PROD-8359).
 * Run: `npx tsx scripts/expand-version.test.ts`
 *
 * Covers compareVersions and selectFloor (the safe backward-scan). The git IO
 * (releaseTagsDescFrom / objectPresentAt) is exercised by the CLI against the repo.
 */
import * as assert from 'assert';
import { compareVersions, selectFloor } from './expand-version';

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

// --- compareVersions ---------------------------------------------------------

test('compareVersions orders by numeric semver, not lexically', () => {
    assert.strictEqual(compareVersions('0.3260.2', '0.3260.10') < 0, true); // 2 < 10 numerically
    assert.strictEqual(compareVersions('0.3261.0', '0.3260.9') > 0, true);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
});

// --- selectFloor -------------------------------------------------------------

// tagsDesc youngest-first; presentAt(tag) = the object is referenced at that tag.
const tags = ['0.3260.0', '0.3259.0', '0.3258.0', '0.3257.0', '0.3256.0'];

test('finds the transition: floor is the youngest tag where it became absent', () => {
    // absent at 3260/3259/3258, present at 3257 and older → expand landed in 3258
    const presentAt = (t: string) => compareVersions(t, '0.3257.0') <= 0;
    assert.strictEqual(selectFloor(tags, presentAt), '0.3258.0');
});

test('absent only at the verified release → floor is that release', () => {
    // present everywhere except the youngest → the drop is barely safe from 3260
    const presentAt = (t: string) => t !== '0.3260.0';
    assert.strictEqual(selectFloor(tags, presentAt), '0.3260.0');
});

test('absent throughout the scanned window → floor is the oldest scanned (verified absent that far)', () => {
    const presentAt = () => false;
    assert.strictEqual(selectFloor(tags, presentAt), '0.3256.0');
});

test('contradiction — present at the verified release → null (stay conservative)', () => {
    const presentAt = () => true;
    assert.strictEqual(selectFloor(tags, presentAt), null);
});

test('a grep false-positive at an older tag only RAISES the floor (safe direction)', () => {
    // truly absent from 3258, but a stray match at 3257 (false positive) stops the scan
    const presentAt = (t: string) => t === '0.3257.0';
    // floor is 3258 (conservative) rather than 3256 — never lower than the truth
    assert.strictEqual(selectFloor(tags, presentAt), '0.3258.0');
});

test('empty tag list → null', () => {
    assert.strictEqual(selectFloor([], () => false), null);
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
