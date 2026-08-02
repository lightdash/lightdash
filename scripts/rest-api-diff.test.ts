/**
 * Unit tests for the PURE core of the REST API breaking-change detector (P2).
 * Run: `npx tsx scripts/rest-api-diff.test.ts`
 *
 * Self-contained (node:assert) — covers summarizeBreaking, the deterministic
 * reduction of oasdiff's `breaking` JSON into the marker's api.rest shape, and
 * selection of an explicit working-tree spec.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { diffRestApi, OasdiffItem, summarizeBreaking } from './rest-api-diff';

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

test('uses an explicit working-tree spec as the new side', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-diff-test-'));
    try {
        const specPath = path.join(dir, 'swagger.json');
        const oasdiffPath = path.join(dir, 'oasdiff');
        fs.writeFileSync(specPath, '{}');
        fs.writeFileSync(oasdiffPath, '#!/bin/sh\nprintf "[]"\n');
        fs.chmodSync(oasdiffPath, 0o755);

        const result = diffRestApi({
            lastTag: 'HEAD',
            newSpecPath: specPath,
            oasdiffBin: oasdiffPath,
        });

        assert.deepStrictEqual(result, {
            checked: true,
            breaking: false,
            changes: [],
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('diffs an explicitly generated spec pair, touching no git ref', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-diff-test-'));
    try {
        const basePath = path.join(dir, 'base.json');
        const newPath = path.join(dir, 'pr.json');
        // Echoes the two spec paths it was handed so the test can assert the pair
        // reached oasdiff; the JSON payload is what diffRestApi parses.
        const oasdiffPath = path.join(dir, 'oasdiff');
        const argsLog = path.join(dir, 'args.txt');
        fs.writeFileSync(basePath, '{"old":true}');
        fs.writeFileSync(newPath, '{"new":true}');
        fs.writeFileSync(oasdiffPath, `#!/bin/sh\ncat "$2" "$3" > ${argsLog}\nprintf "[]"\n`);
        fs.chmodSync(oasdiffPath, 0o755);

        const result = diffRestApi({
            baseSpecPath: basePath,
            newSpecPath: newPath,
            oasdiffBin: oasdiffPath,
        });

        assert.deepStrictEqual(result, { checked: true, breaking: false, changes: [] });
        assert.strictEqual(fs.readFileSync(argsLog, 'utf-8'), '{"old":true}{"new":true}');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a missing generated spec stays unchecked rather than reporting no changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-diff-test-'));
    try {
        const present = path.join(dir, 'pr.json');
        const oasdiffPath = path.join(dir, 'oasdiff');
        fs.writeFileSync(present, '{}');
        fs.writeFileSync(oasdiffPath, '#!/bin/sh\nprintf "[]"\n');
        fs.chmodSync(oasdiffPath, 0o755);

        const missingBase = diffRestApi({
            baseSpecPath: path.join(dir, 'absent.json'),
            newSpecPath: present,
            oasdiffBin: oasdiffPath,
        });
        assert.deepStrictEqual(missingBase, { checked: false, breaking: false, changes: [] });

        const missingNew = diffRestApi({
            baseSpecPath: present,
            newSpecPath: path.join(dir, 'absent.json'),
            oasdiffBin: oasdiffPath,
        });
        assert.deepStrictEqual(missingNew, { checked: false, breaking: false, changes: [] });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the old side must be exactly one of a git ref or a generated spec', () => {
    assert.throws(
        () => diffRestApi({ oasdiffBin: '/nonexistent' }),
        /exactly one of lastTag or baseSpecPath/,
    );
    assert.throws(
        () => diffRestApi({ lastTag: 'HEAD', baseSpecPath: '/tmp/base.json', oasdiffBin: '/nonexistent' }),
        /exactly one of lastTag or baseSpecPath/,
    );
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
