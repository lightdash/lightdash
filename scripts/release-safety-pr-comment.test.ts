import * as assert from 'assert';
import * as fs from 'fs';
import {
    COMMENT_MARKER,
    Marker,
    renderPrComment,
} from './release-safety-pr-comment';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed += 1;
    } catch (error) {
        failures.push(
            `${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

const baseMarker = (overrides: Partial<Marker> = {}): Marker => ({
    schemaVersion: '2',
    version: 'pr-1',
    previousVersion: 'abc1234',
    releaseDate: '2026-08-10T00:00:00.000Z',
    migrations: {
        present: false,
        count: 0,
        coreCount: 0,
        eeCount: 0,
        files: [],
    },
    compatibility: {
        rollingUpdateSafe: true,
        recommendedStrategy: 'RollingUpdate',
    },
    api: {
        rest: { checked: true, breaking: false, changes: [] },
        mcp: { checked: true, breaking: false, changes: [] },
    },
    config: { checked: true, breaking: false, changes: [] },
    upgrade: { minPreviousVersion: null, requiredStops: [] },
    declaredBreaks: [],
    ...overrides,
});

test('safe v2 marker renders the sticky upgrade summary', () => {
    const body = renderPrComment(baseMarker());
    assert.ok(body.startsWith(COMMENT_MARKER));
    assert.match(body, /Safe to upgrade normally/);
    assert.match(body, /Database changes \| none/);
});

test('unknown verdict is rendered as unsafe for a ready PR', () => {
    const body = renderPrComment(
        baseMarker({
            compatibility: {
                rollingUpdateSafe: 'unknown',
                recommendedStrategy: 'Recreate',
            },
        }),
        { draft: false },
    );
    assert.match(body, /Couldn’t confirm it’s safe/);
    assert.match(body, /Double-check the old version/);
    assert.match(body, /How to unblock this pull request/);
    assert.match(body, /required check must pass before merge/);
    assert.match(body, /Never declare a break merely to make CI pass/);
    assert.match(body, /internal analytics instance upgrading/);
});

test('a declaration gate failure renders remediation for an otherwise green marker', () => {
    const body = renderPrComment(baseMarker(), { declarationGateFailed: true });
    assert.match(body, /How to unblock this pull request/);
    assert.match(body, /migration break/);
    assert.match(body, /API or type break/);
});

test('migration and enterprise counts use the v2 split', () => {
    const body = renderPrComment(
        baseMarker({
            migrations: {
                present: true,
                count: 2,
                coreCount: 1,
                eeCount: 1,
                files: [],
            },
            compatibility: {
                rollingUpdateSafe: 'unknown',
                recommendedStrategy: 'Recreate',
            },
        }),
    );
    assert.match(body, /2 migrations \(incl\. enterprise\)/);
});

test('current release in requiredStops is rendered as a required stop', () => {
    const body = renderPrComment(
        baseMarker({
            upgrade: {
                minPreviousVersion: '1.100.0',
                requiredStops: ['pr-1'],
            },
        }),
    );
    assert.match(body, /Customers can’t skip this version/);
    assert.match(body, /Upgrade notes \| can’t be skipped/);
});

test('REST and MCP breaking details remain visible', () => {
    const body = renderPrComment(
        baseMarker({
            compatibility: {
                rollingUpdateSafe: false,
                recommendedStrategy: 'Recreate',
            },
            api: {
                rest: {
                    checked: true,
                    breaking: true,
                    changes: ['GET /legacy removed'],
                },
                mcp: {
                    checked: true,
                    breaking: true,
                    changes: ['tool removed'],
                },
            },
        }),
    );
    assert.match(body, /breaking change to the REST API/);
    assert.match(body, /breaking change to the MCP tools/);
});

test('failed REST generation replaces a false-safe headline', () => {
    const marker = baseMarker();
    marker.api.rest = {
        checked: false,
        breaking: 'unknown',
        changes: [],
    };
    const body = renderPrComment(marker, { restStatus: 'failed' });
    assert.doesNotMatch(body, /✅ \*\*Safe to upgrade normally/);
    assert.match(body, /REST API check didn’t run/);
});

test('raw v2 JSON is embedded for machines', () => {
    const body = renderPrComment(baseMarker());
    assert.match(body, /Technical details \(raw JSON\)/);
    assert.match(body, /"schemaVersion": "2"/);
    assert.doesNotMatch(body, /"capabilities"/);
    assert.doesNotMatch(body, /How to unblock this pull request/);
});

const HEAD = '4146779f7a801f252b99ddfa68a5e8217d08fefb';
const BASE = 'd92d59798a4f0207927eea6c1ac31eafb6b1090e';

test('a passing verdict stamps the revision it describes', () => {
    const body = renderPrComment(baseMarker(), { headSha: HEAD, baseSha: BASE });
    assert.match(
        body,
        new RegExp(`<!-- release-safety-describes head:${HEAD} base:${BASE} gate:pass -->`),
    );
});

test('a failed gate stamps gate:fail so it can never be short-circuited', () => {
    const body = renderPrComment(baseMarker(), { headSha: HEAD, baseSha: BASE, gateFailed: true });
    assert.match(body, /release-safety-describes .* gate:fail -->/);
    assert.doesNotMatch(body, /gate:pass/);
});

test('the stamp is omitted when the revision is unknown', () => {
    assert.doesNotMatch(renderPrComment(baseMarker()), /release-safety-describes/);
    assert.doesNotMatch(
        renderPrComment(baseMarker(), { headSha: HEAD }),
        /release-safety-describes/,
    );
});

test('the stamp matches the regex the workflow reads it with', () => {
    const workflow = fs.readFileSync('.github/workflows/release-safety-pr.yml', 'utf-8');
    const declared = workflow.match(
        /\/<!-- release-safety-describes head:\(\[0-9a-f\]\{7,40\}\) base:\(\[0-9a-f\]\{7,40\}\) gate:\(pass\|fail\) -->\//,
    );
    assert.ok(declared, 'the workflow reader regex is not in the expected form');

    const reader =
        /<!-- release-safety-describes head:([0-9a-f]{7,40}) base:([0-9a-f]{7,40}) gate:(pass|fail) -->/;
    const emitted = renderPrComment(baseMarker(), { headSha: HEAD, baseSha: BASE }).match(reader);
    assert.ok(emitted, 'the rendered stamp does not match the reader regex');
    assert.strictEqual(emitted[1], HEAD);
    assert.strictEqual(emitted[2], BASE);
    assert.strictEqual(emitted[3], 'pass');
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
