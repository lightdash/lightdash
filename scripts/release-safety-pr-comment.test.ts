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
    assert.ok(body.includes('### Detector checks'));
    assert.ok(body.includes('### What would happen on deploy to customers'));
});

test('AI review is the verdict synthesis, NOT a detector row', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['a.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI rolling-update review: verified additive.' },
    }), { draft: false });
    const matrix = body.slice(body.indexOf('### Detector checks'), body.indexOf('### What would happen'));
    // the detector table header reads "Detector", and the AI review is not a row in it
    assert.ok(matrix.includes('| Detector | Status | Result |'));
    assert.ok(!matrix.includes('| AI rolling-update review |'));
    // the AI appears as the verdict judgement line, above the table
    assert.ok(/🧠 \*\*Verdict\*\*.*only path to ✅ safe — it isn’t a detector/.test(body));
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
    assert.ok(/Mark this PR ready for review.*run the AI rolling-update review/s.test(body));
    assert.ok(body.includes('is skipped on drafts — mark this PR ready to run it'));
    assert.ok(body.includes('2 added'));
});

test('ready PR, AI ran and cleared it => Safe, ai-review row shows ran', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['a.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI migration review: verified additive.' },
    }), { draft: false });
    assert.ok(body.includes('Safe to RollingUpdate'));
    assert.ok(body.includes('validated the flagged change(s) and cleared them → ✅'));
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

test('genuine breaking change advises BOTH the merge-now impact and the expand/contract alternative', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'AI migration review: old code still reads the column.' },
    }), { draft: false, linterBreaking: true });
    assert.ok(body.includes('### What you should do'));
    assert.ok(/If you must merge this change now/.test(body));
    assert.ok(/Recreate/.test(body));
    assert.ok(/Safer alternative — expand\/contract/.test(body));
    assert.ok(/land the app change FIRST/.test(body));
});

test('expand/contract clearance advises the minPreviousVersion floor + how to lower it', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        previousVersion: '0.3260.2',
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI migration review CLEARED a deterministic linter flag (expand/contract): ...' },
        upgrade: { minPreviousVersion: '0.3260.2', requiredStop: false, note: 'Auto-derived: ...' },
    }), { draft: false, linterBreaking: true });
    assert.ok(body.includes('### What you should do'));
    assert.ok(/safe \*\*only when upgrading from `0\.3260\.2` or later/.test(body));
    assert.ok(/auto-sets `upgrade.minPreviousVersion`/.test(body));
    assert.ok(/release-safety\.overrides\.json/.test(body));
});

test('a plain safe migration gives no "what you should do" section', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['add.ts'], ee: false },
        compatibility: { rollingUpdateSafe: true, recommendedStrategy: 'RollingUpdate', notes: 'AI migration review: additive, verified.' },
    }), { draft: false, linterBreaking: false });
    assert.ok(!body.includes('### What you should do'));
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

test('verdict attributes to the baseline (not the AI) when the AI ran but was inconclusive', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['a.ts'], ee: false },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: 'AI rolling-update review: could not verify.' },
    }), { draft: false });
    assert.ok(/ran but could not conclude, so the deterministic baseline stands/.test(body));
});

test('verdict attributes a ❌ to the SQL-linter floor when the AI did not clear it', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'sql-lint', 'ai-review', 'upgrade'],
        migrations: { present: true, count: 1, files: ['drop.ts'], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'Migration linter detected breaking schema operations (...).' },
    }), { draft: false, linterBreaking: true });
    assert.ok(/did not clear the SQL-linter floor, which stands → ❌/.test(body));
});

test('API-driven break (no migration) reads as an API change, not a schema change', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'ai-review', 'rest', 'upgrade'],
        migrations: { present: false, count: 0, files: [], ee: false },
        compatibility: { rollingUpdateSafe: false, recommendedStrategy: 'Recreate', notes: 'AI rolling-update review: the bundled frontend reads the removed field.' },
        api: {
            rest: { checked: true, breaking: true, changes: ['GET /api/v1/saved — response field removed'] },
            mcp: { checked: false, breaking: false, changes: [] },
        },
    }), { draft: false });
    assert.ok(body.includes('Recreate required'));
    assert.ok(/breaking API change was flagged/.test(body));
    // it must NOT claim a schema break / crash loop when there's no migration
    assert.ok(!/breaking schema change was detected/.test(body));
    assert.ok(/in-flight consumer/.test(body));
    assert.ok(body.includes('confirmed a breaking change → ❌'));
    assert.ok(body.includes('only path to ✅ safe — it isn’t a detector'));
});

test('API-driven unknown (no migration) describes an API change, not schema', () => {
    const body = renderPrComment(baseMarker({
        capabilities: ['migrations', 'ai-review', 'mcp', 'upgrade'],
        migrations: { present: false, count: 0, files: [], ee: false },
        compatibility: { rollingUpdateSafe: 'unknown', recommendedStrategy: 'Recreate', notes: 'AI rolling-update review: could not determine.' },
        api: {
            rest: { checked: false, breaking: false, changes: [] },
            mcp: { checked: true, breaking: true, changes: ['MCP tool `run_query` input now required'] },
        },
    }));
    assert.ok(body.includes('Recreate recommended'));
    assert.ok(/carries an API change/.test(body));
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
