/**
 * Unit tests for the PURE core of the REST API breaking-change detector (P2).
 * Run: `npx tsx scripts/rest-api-diff.test.ts`
 *
 * Self-contained (node:assert) — covers summarizeBreaking, the deterministic
 * reduction of oasdiff's `breaking` JSON into the marker's api.rest shape. The IO
 * shell (git show + oasdiff) is exercised by the CLI against real tags, not here.
 */
import * as assert from 'assert';
import { OasdiffItem, summarizeBreaking } from './rest-api-diff';

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

const item = (over: Partial<OasdiffItem> = {}): OasdiffItem => ({
    id: 'api-removed-without-deprecation',
    text: 'api removed without deprecation',
    level: 3,
    operation: 'GET',
    path: '/api/v1/foo',
    ...over,
});

test('empty list => not breaking, no changes', () => {
    const r = summarizeBreaking([]);
    assert.strictEqual(r.breaking, false);
    assert.deepStrictEqual(r.changes, []);
});

test('non-empty list => breaking true, formatted "METHOD path — text"', () => {
    const r = summarizeBreaking([
        item(),
        item({ operation: 'POST', path: '/api/v1/bar', text: 'the `query` request parameter `q` became required' }),
    ]);
    assert.strictEqual(r.breaking, true);
    assert.deepStrictEqual(r.changes, [
        'GET /api/v1/foo — api removed without deprecation',
        'POST /api/v1/bar — the `query` request parameter `q` became required',
    ]);
});

test('renders gracefully when operation/path are absent', () => {
    const r = summarizeBreaking([item({ operation: undefined, path: undefined, text: 'something broke' })]);
    assert.strictEqual(r.breaking, true);
    assert.deepStrictEqual(r.changes, ['something broke']);
});

test('caps the list at 50 with an explicit overflow line (never silent truncation)', () => {
    const many = Array.from({ length: 53 }, (_, i) => item({ path: `/api/v1/r${i}` }));
    const r = summarizeBreaking(many);
    assert.strictEqual(r.breaking, true);
    assert.strictEqual(r.changes.length, 51); // 50 + overflow line
    assert.match(r.changes[50], /and 3 more breaking change\(s\)/);
});

test('exactly 50 changes => no overflow line', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => item({ path: `/api/v1/r${i}` }));
    const r = summarizeBreaking(fifty);
    assert.strictEqual(r.changes.length, 50);
    assert.ok(!/more breaking change/.test(r.changes[49]));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
