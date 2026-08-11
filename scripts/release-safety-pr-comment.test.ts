import * as assert from 'assert';
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
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
