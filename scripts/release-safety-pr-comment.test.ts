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

/** The human-facing part — visible copy only (drop the invisible HTML anchor and the raw JSON). */
const humanPart = (body: string): string =>
    body.replace(COMMENT_MARKER, '').slice(0, body.indexOf('<details>'));

test('always carries the sticky anchor + plain title + "what we looked at"', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.ok(body.includes('## 🛡️ Upgrade safety for self-hosted customers'));
    assert.ok(body.includes('**What we looked at**'));
});

test('the human-facing copy uses no internal jargon', () => {
    // Render a rich marker so every branch's copy is exercised, then assert the
    // visible part (not the raw JSON) is free of insider vocab.
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'rest', 'mcp', 'upgrade'],
        migrations: { present: true, count: 1, files: ['x.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'Migration linter detected breaking schema operations (...).' },
        api: { rest: { checked: true, breaking: true, changes: ['GET /x — removed'] }, mcp: { checked: true, breaking: true, changes: ['tool y removed'] } },
    }), { linterBreaking: true });
    const human = humanPart(body);
    for (const word of ['rollingUpdateSafe', 'RollingUpdate', 'Recreate', 'detector', 'Detector', 'marker', 'expand/contract', 'CrashLoopBackOff', 'oasdiff', 'MCP tool surface', 'SQL-shape', 'Verdict']) {
        assert.ok(!human.includes(word), `human copy should not contain "${word}"`);
    }
});

test('no database change => safe to upgrade normally', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.includes('✅ **Safe to upgrade normally.**'));
    assert.ok(body.includes('No database changes in this release.'));
    assert.ok(body.includes('| Database changes | none |'));
});

test('breaking schema change => needs care + plain why + both fixes', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 1, files: ['x.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'Migration linter detected breaking schema operations (x.ts:3 drops a column [drop-column]).' },
    }), { linterBreaking: true });
    assert.ok(body.includes('⚠️ **Needs care on upgrade.**'));
    assert.ok(/old version keeps serving traffic/.test(body));
    assert.ok(/restart the app during the upgrade/.test(body));
    assert.ok(/stop using it in the app \*first\*/.test(body));
    assert.ok(body.includes('| Database changes | 1 migration |'));
});

test('draft with unverified DB change => couldn’t confirm + invites marking ready', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 2, files: ['a.ts', 'b.ts'], ee: false },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: '...' },
    }), { draft: true });
    assert.ok(body.includes('❓ **Couldn’t confirm it’s safe.**'));
    assert.ok(/Mark the PR ready for review/.test(body));
    assert.ok(body.includes('| Database changes | 2 migrations |'));
});

test('ready but unverified => couldn’t confirm + double-check advice (no draft nudge)', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 1, files: ['a.ts'], ee: false },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: '...' },
    }), { draft: false });
    assert.ok(body.includes('❓ **Couldn’t confirm it’s safe.**'));
    assert.ok(/Double-check the old version keeps working/.test(body));
    assert.ok(!/Mark the PR ready/.test(body));
});

test('safe drop (old version stopped using it) => safe + version floor advice', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        previousVersion: '0.3260.2',
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI rolling-update review CLEARED a deterministic linter flag (expand/contract): ...' },
        upgrade: { minPreviousVersion: '0.3260.2', requiredStop: false, note: 'Auto-derived: ...' },
    }), { draft: false, linterBreaking: true });
    assert.ok(body.includes('✅ **Safe to upgrade normally.**'));
    assert.ok(/already stopped using it in an earlier release/.test(body));
    assert.ok(/only when upgrading from `0\.3260\.2` or later/.test(body));
    assert.ok(/release-safety\.overrides\.json/.test(body));
    assert.ok(body.includes('| Upgrade notes | safe from 0.3260.2 onward |'));
});

test('API-driven break (no migration) reads as an API problem + restart advice', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'ai-review', 'rest', 'upgrade'],
        migrations: { present: false, count: 0, files: [], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'AI rolling-update review: the bundled frontend reads the removed field.' },
        api: { rest: { checked: true, breaking: true, changes: ['GET /api/v1/saved — field removed'] }, mcp: { checked: false, breaking: false, changes: [] } },
    }), { draft: false });
    assert.ok(body.includes('⚠️ **Needs care on upgrade.**'));
    assert.ok(/changes the API in a way the already-running version can’t handle/.test(body));
    assert.ok(/breaking change to the REST API/.test(body));
    assert.ok(/keep the old API response working alongside/.test(body));
    assert.ok(body.includes('| REST API | 1 breaking change |'));
});

test('MCP breaking change is called out for agents/clients', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'mcp', 'upgrade'],
        api: { rest: { checked: true, breaking: false, changes: [] }, mcp: { checked: true, breaking: true, changes: ['tool y removed'] } },
    }));
    assert.ok(/breaking change to the MCP tools/.test(body));
    assert.ok(body.includes('| MCP tools | 1 breaking change |'));
});

test('required stop is surfaced in plain terms', () => {
    const body = renderPrComment(baseMarker({
        upgrade: { minPreviousVersion: '0.3200.0', requiredStop: true, note: 'Index rebuild.' },
    }));
    assert.ok(body.includes('🛑 **Customers can’t skip this version.**'));
    assert.ok(body.includes('Index rebuild.'));
    assert.ok(body.includes('| Upgrade notes | can’t be skipped |'));
});

test('plain safe migration gives no "what to do" section', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['add.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI rolling-update review: additive, verified.' },
    }), { draft: false, linterBreaking: false });
    assert.ok(body.includes('✅ **Safe to upgrade normally.**'));
    assert.ok(!body.includes('**What to do**'));
});

test('EE migrations are labelled in plain words', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'upgrade'],
        migrations: { present: true, count: 1, files: ['x.ts'], ee: true },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: '...' },
    }));
    assert.ok(body.includes('1 migration (incl. enterprise)'));
});

test('base label is rendered when provided', () => {
    const body = renderPrComment(baseMarker(), { baseLabel: 'main (a1b2c3d)' });
    assert.ok(body.includes('Comparing against `main (a1b2c3d)`'));
});

test('raw JSON is embedded in a collapsed details block', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.includes('<details><summary>Technical details (raw JSON)</summary>'));
    assert.ok(body.includes('"rollingUpdateSafe"'));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
