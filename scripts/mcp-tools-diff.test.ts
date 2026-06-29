/**
 * Unit tests for the PURE core of the MCP tool-surface diff (P3).
 * Run: `npx tsx scripts/mcp-tools-diff.test.ts`
 *
 * Covers the conservative 4-rule classifier (diffSnapshots). The IO shell
 * (git show + parse) is exercised by the CLI against committed snapshots.
 */
import * as assert from 'assert';
import { diffSnapshots, SnapshotTool, ToolsSnapshot } from './mcp-tools-diff';

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

const snap = (tools: SnapshotTool[]): ToolsSnapshot => ({ schemaVersion: '1', tools });
const tool = (name: string, props: Record<string, string> = {}, required: string[] = []): SnapshotTool => ({
    name,
    inputSchema: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, { type: t }])),
        required,
    },
});

test('identical snapshots => not breaking', () => {
    const a = snap([tool('find_explores', { q: 'string' }), tool('run_query', { sql: 'string' })]);
    const r = diffSnapshots(a, a);
    assert.strictEqual(r.breaking, false);
    assert.deepStrictEqual(r.changes, []);
});

test('R1: removed tool is breaking', () => {
    const r = diffSnapshots(snap([tool('a'), tool('b')]), snap([tool('a')]));
    assert.strictEqual(r.breaking, true);
    assert.deepStrictEqual(r.changes, ['MCP tool `b` removed']);
});

test('added tool is NOT breaking (additive)', () => {
    const r = diffSnapshots(snap([tool('a')]), snap([tool('a'), tool('b')]));
    assert.strictEqual(r.breaking, false);
});

test('R2: optional -> required is breaking', () => {
    const r = diffSnapshots(
        snap([tool('a', { x: 'string' }, [])]),
        snap([tool('a', { x: 'string' }, ['x'])]),
    );
    assert.deepStrictEqual(r.changes, ['MCP tool `a`: input `x` became required']);
});

test('R2: newly-added REQUIRED field is breaking', () => {
    const r = diffSnapshots(
        snap([tool('a', { x: 'string' }, [])]),
        snap([tool('a', { x: 'string', y: 'string' }, ['y'])]),
    );
    assert.deepStrictEqual(r.changes, ['MCP tool `a`: input `y` became required']);
});

test('newly-added OPTIONAL field is NOT breaking', () => {
    const r = diffSnapshots(
        snap([tool('a', { x: 'string' }, [])]),
        snap([tool('a', { x: 'string', y: 'string' }, [])]),
    );
    assert.strictEqual(r.breaking, false);
});

test('R3: removed input field is breaking', () => {
    const r = diffSnapshots(
        snap([tool('a', { x: 'string', y: 'string' }, [])]),
        snap([tool('a', { x: 'string' }, [])]),
    );
    assert.deepStrictEqual(r.changes, ['MCP tool `a`: input `y` removed']);
});

test('R4: input field type change is breaking', () => {
    const r = diffSnapshots(
        snap([tool('a', { x: 'string' }, [])]),
        snap([tool('a', { x: 'number' }, [])]),
    );
    assert.deepStrictEqual(r.changes, ['MCP tool `a`: input `x` type changed string → number']);
});

test('description/title/output/annotation-only changes are NOT breaking', () => {
    const before = snap([{ name: 'a', title: 'Old', description: 'old', inputSchema: { type: 'object', properties: { x: { type: 'string' } } }, outputSchema: { type: 'object', properties: { r: { type: 'string' } } } }]);
    const after = snap([{ name: 'a', title: 'New', description: 'new', annotations: { readOnlyHint: false }, inputSchema: { type: 'object', properties: { x: { type: 'string' } } }, outputSchema: { type: 'object', properties: { r: { type: 'number' } } } }]);
    const r = diffSnapshots(before, after);
    assert.strictEqual(r.breaking, false);
});

test('multiple breaking changes accumulate, deterministic order', () => {
    const before = snap([tool('a', { x: 'string', y: 'string' }, []), tool('b', { z: 'string' }, [])]);
    const after = snap([tool('a', { x: 'number' }, ['x'])]); // y removed, x type-changed + required, b removed
    const r = diffSnapshots(before, after);
    assert.ok(r.changes.includes('MCP tool `b` removed'));
    assert.ok(r.changes.includes('MCP tool `a`: input `y` removed'));
    assert.ok(r.changes.includes('MCP tool `a`: input `x` became required'));
    assert.ok(r.changes.includes('MCP tool `a`: input `x` type changed string → number'));
    assert.strictEqual(r.breaking, true);
});

test('missing/empty inputSchema is treated as no properties (no crash)', () => {
    const before = snap([{ name: 'a' }]);
    const after = snap([{ name: 'a', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } }]);
    const r = diffSnapshots(before, after);
    // x is newly-added AND required => breaking
    assert.deepStrictEqual(r.changes, ['MCP tool `a`: input `x` became required']);
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
