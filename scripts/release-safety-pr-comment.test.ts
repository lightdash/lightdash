/**
 * Unit tests for the PR-comment renderer (PROD-8359).
 * Run: `npx tsx scripts/release-safety-pr-comment.test.ts`
 */
import * as assert from 'assert';
import { COMMENT_MARKER, Marker, renderPrComment } from './release-safety-pr-comment';

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

const baseMarker = (over: Partial<Marker> = {}): Marker => ({
    version: 'pr-1',
    previousVersion: 'abc1234',
    capabilities: ['migrations', 'upgrade'],
    migrations: { present: false, count: 0, files: [], ee: false },
    compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'No database migrations detected.' },
    api: { rest: { checked: false, breaking: false, changes: [] }, mcp: { checked: false, breaking: false, changes: [] } },
    upgrade: { minPreviousVersion: null, requiredStop: false, note: null },
    ...over,
});

test('always carries the sticky marker + heading', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.ok(body.includes('## 🛡️ Release-safety preview'));
    assert.ok(body.includes('### Check matrix'));
    assert.ok(body.includes('### What would happen on deploy to customers'));
});

test('no-migration release => safe to RollingUpdate', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(/No database migrations.*safe to RollingUpdate/i.test(body));
    assert.ok(body.includes('a **RollingUpdate** is safe'));
});

test('linter-flagged breaking => Recreate required + deterministic note', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 1, files: ['x.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'Migration linter detected breaking schema operations (x.ts:3 drops a column [drop-column]).' },
    }));
    assert.ok(body.includes('Recreate required'));
    assert.ok(body.includes('CrashLoopBackOff'));
    assert.ok(body.includes('flagged deterministically by the SQL linter'));
    assert.ok(/breaking schema op\(s\) found/.test(body));
});

const unknownMigrationMarker = (): Marker => baseMarker({
    capabilities: ['migrations', 'sql-lint', 'upgrade'],
    migrations: { present: true, count: 2, files: ['a.ts', 'b.ts'], ee: false },
    compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: 'This release contains database migrations...' },
});

test('draft PR with unknown verdict => invites marking ready to run the AI review', () => {
    const body = renderPrComment(unknownMigrationMarker(), { draft: true });
    assert.ok(body.includes('Recreate recommended'));
    assert.ok(/Mark this PR ready for review.*run the AI migration review/s.test(body));
    assert.ok(body.includes('skipped (draft PR — mark ready to run it)'));
    assert.ok(body.includes('2 added'));
});

test('ready PR, AI ran and cleared it => Safe, ai-review row shows ran', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['a.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI migration review: verified additive.' },
    }), { draft: false });
    assert.ok(body.includes('Safe to RollingUpdate'));
    assert.ok(body.includes('✅ ran — verdict folded into the determination'));
    // no "mark ready" nudge once it has actually run
    assert.ok(!/Mark this PR ready/.test(body));
});

test('ready PR, AI ran but stayed unknown => no "mark ready" nudge, no false "release-time" claim', () => {
    const body = renderPrComment(unknownMigrationMarker(), { draft: false });
    assert.ok(body.includes('Recreate recommended'));
    assert.ok(!/Mark this PR ready/.test(body));
    assert.ok(body.includes('did not positively clear it'));
    assert.ok(!body.includes('release-time only'));
});

test('expand/contract clearance: linter flagged but AI cleared => Safe + explained', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI migration review CLEARED a deterministic linter flag — it verified the previous release no longer uses the changed object (expand/contract): ...' },
    }), { draft: false, linterBreaking: true });
    assert.ok(body.includes('Safe to RollingUpdate'));
    assert.ok(/expand\/contract/.test(body));
    assert.ok(body.includes('AI cleared it — see below'));
    assert.ok(/contract.* step of an expand\/contract/.test(body));
    // not a "Recreate required"
    assert.ok(!body.includes('Recreate required'));
});

test('linterBreaking flag still shows breaking when the AI did NOT clear it', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'Migration linter detected breaking schema operations (...).' },
    }), { draft: false, linterBreaking: true });
    assert.ok(body.includes('Recreate required'));
    assert.ok(body.includes('⚠️ breaking schema op(s) found'));
});

test('required stop is surfaced prominently', () => {
    const body = renderPrComment(baseMarker({
        upgrade: { minPreviousVersion: '0.3200.0', requiredStop: true, note: 'Index rebuild.' },
    }));
    assert.ok(body.includes('🛑 **Required stop**'));
    assert.ok(body.includes('skipping this one'));
    assert.ok(body.includes('🛑 required stop'));
});

test('REST + MCP breaking changes are flagged in determination and consequences', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'rest', 'mcp', 'upgrade'],
        api: {
            rest: { checked: true, breaking: true, changes: ['GET /x — removed'] },
            mcp: { checked: true, breaking: true, changes: ['MCP tool `y` removed'] },
        },
    }));
    assert.ok(body.includes('REST API breaking change'));
    assert.ok(body.includes('MCP tool breaking change'));
    assert.ok(/1 breaking change\(s\)/.test(body));
});

test('EE migrations are labelled', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 1, files: ['x.ts'], ee: true },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: '...' },
    }));
    assert.ok(body.includes('1 added (incl. EE)'));
});

test('base label is rendered when provided', () => {
    const body = renderPrComment(baseMarker(), { baseLabel: 'main (a1b2c3d)' });
    assert.ok(body.includes('Compared against `main (a1b2c3d)`'));
});

test('raw marker JSON is embedded in a details block', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.includes('<details><summary>Raw marker JSON</summary>'));
    assert.ok(body.includes('"schemaVersion"') === false); // baseMarker has no schemaVersion; ensure we serialize what we got
    assert.ok(body.includes('"rollingUpdateSafe"'));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
