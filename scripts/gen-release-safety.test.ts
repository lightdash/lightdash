import * as assert from 'assert';
import {
    buildMarker,
    detectMigrations,
    GitChange,
    MARKER_SCHEMA_VERSION,
    ownExpandContractFloor,
    parseArgs,
} from './gen-release-safety';

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

const core = 'packages/backend/src/database/migrations';
const ee = 'packages/backend/src/ee/database/migrations';
const change = (status: string, filePath: string): GitChange => ({
    status,
    path: filePath,
});
const base = {
    version: '1.115.0',
    previousVersion: '1.114.0',
    releaseDate: '2026-08-10T00:00:00.000Z',
};
const checkedSurfaces = {
    restApi: {
        checked: true,
        breaking: false as const,
        changes: [],
        breakingCount: 0,
        advisories: [],
        advisoryCount: 0,
    },
    mcpApi: {
        checked: true,
        breaking: false as const,
        changes: [],
        breakingCount: 0,
        advisories: [],
        advisoryCount: 0,
    },
    config: { checked: true, breaking: false as const, changes: [] },
};
const noMigrations = {
    present: false as const,
    count: 0,
    files: [],
    ee: false,
    deletedHistorical: [],
};
const migration = {
    present: true as const,
    count: 1,
    files: ['20260810000000_users.ts'],
    ee: false,
    deletedHistorical: [],
};
const migrationDetails = [
    {
        name: '20260810000000_users.ts',
        edition: 'core' as const,
        tables: ['users'],
        heaviness: {
            locksTable: true,
            rewritesTable: false,
            scansTable: false,
        },
    },
];

test('parses an explicit generated MCP snapshot pair', () => {
    const args = parseArgs([
        '--version',
        'pr-1',
        '--mcp-base-snapshot',
        '/tmp/base-mcp.json',
        '--mcp-new-snapshot',
        '/tmp/pr-mcp.json',
    ]);
    assert.strictEqual(args.mcpBaseSnapshot, '/tmp/base-mcp.json');
    assert.strictEqual(args.mcpNewSnapshot, '/tmp/pr-mcp.json');
});

test('rejects an incomplete generated MCP snapshot pair', () => {
    assert.throws(
        () =>
            parseArgs([
                '--version',
                'pr-1',
                '--mcp-base-snapshot',
                '/tmp/base-mcp.json',
            ]),
        /--mcp-base-snapshot and --mcp-new-snapshot must be given together/,
    );
});

test('detectMigrations counts only added timestamped files and splits EE', () => {
    const result = detectMigrations([
        change('A', `${core}/20260810000000_core.ts`),
        change('A', `${ee}/20260810000001_ee.ts`),
        change('M', `${core}/20200101000000_old.ts`),
    ]);
    assert.strictEqual(result.present, true);
    assert.strictEqual(result.count, 2);
    assert.strictEqual(result.ee, true);
    assert.deepStrictEqual(result.files, [
        '20260810000000_core.ts',
        '20260810000001_ee.ts',
    ]);
});

test('detectMigrations ignores migration tests knex never loads', () => {
    const result = detectMigrations([
        change('A', `${core}/20260810000000_core.ts`),
        change('A', `${core}/__tests__/20260810000000_core.test.ts`),
    ]);
    assert.strictEqual(result.count, 1);
    assert.deepStrictEqual(result.files, ['20260810000000_core.ts']);
});

test('detectMigrations surfaces deleted history without counting it', () => {
    const result = detectMigrations([
        change('D', `${core}/20200101000000_old.ts`),
    ]);
    assert.strictEqual(result.present, false);
    assert.strictEqual(result.count, 0);
    assert.deepStrictEqual(result.deletedHistorical, ['20200101000000_old.ts']);
});

test('fully checked release without migrations is safe', () => {
    const marker = buildMarker({
        ...base,
        migrations: noMigrations,
        migrationDetails: [],
        ...checkedSurfaces,
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, true);
    assert.strictEqual(
        marker.compatibility.recommendedStrategy,
        'RollingUpdate',
    );
});

test('unchecked surface propagates unknown and derives Recreate', () => {
    const marker = buildMarker({
        ...base,
        migrations: noMigrations,
        migrationDetails: [],
        restApi: null,
        mcpApi: checkedSurfaces.mcpApi,
        config: checkedSurfaces.config,
    });
    assert.strictEqual(marker.api.rest.breaking, 'unknown');
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, 'unknown');
    assert.strictEqual(marker.compatibility.recommendedStrategy, 'Recreate');
});

test('migration release stays unknown without a definitive review', () => {
    const marker = buildMarker({
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, 'unknown');
    assert.deepStrictEqual(marker.migrations.files, migrationDetails);
    assert.strictEqual(marker.migrations.coreCount, 1);
    assert.strictEqual(marker.migrations.eeCount, 0);
});

test('definitive AI review can prove a migration safe', () => {
    const marker = buildMarker({
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
        aiReview: {
            rollingUpdateSafe: true,
            recommendedStrategy: 'RollingUpdate',
            summary: 'verified',
        },
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, true);
});

test('incomplete declaration metadata stays unknown after a definitive AI verdict', () => {
    const marker = buildMarker({
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
        declarationMetadataComplete: false,
        aiReview: {
            rollingUpdateSafe: true,
            recommendedStrategy: 'RollingUpdate',
            summary: 'verified',
        },
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, 'unknown');
});

test('a declared break stays unsafe when declaration metadata is incomplete', () => {
    const marker = buildMarker({
        ...base,
        migrations: noMigrations,
        migrationDetails: [],
        ...checkedSurfaces,
        declarationMetadataComplete: false,
        declaredBreaks: [
            {
                id: 'old-workers-read-new-rows',
                reason: 'Old workers cannot read the new rows.',
                requiredStop: false,
            },
        ],
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, false);
});

test('config changes force an unsafe verdict', () => {
    const marker = buildMarker({
        ...base,
        migrations: noMigrations,
        migrationDetails: [],
        restApi: checkedSurfaces.restApi,
        mcpApi: checkedSurfaces.mcpApi,
        config: {
            checked: true,
            breaking: true,
            changes: [
                {
                    type: 'removed',
                    name: 'OLD_ENV',
                    previousDefault: null,
                },
            ],
        },
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, false);
});

test('declared break uses the frozen shape and contributes a required stop', () => {
    const marker = buildMarker({
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
        declaredBreaks: [
            {
                id: 'old-workers-read-new-rows',
                reason: 'old workers cannot read the new rows',
                requiredStop: true,
                migration: `${core}/${migration.files[0]}`,
            },
        ],
    });
    assert.strictEqual(marker.compatibility.rollingUpdateSafe, false);
    assert.deepStrictEqual(marker.upgrade.requiredStops, ['1.115.0']);
});

test('a spent required stop is not pinned again by a later marker', () => {
    const marker = buildMarker({
        ...base,
        version: '1.116.0',
        migrations: noMigrations,
        migrationDetails: [],
        ...checkedSurfaces,
        declaredBreaks: [],
        requiredStops: ['1.115.0'],
    });
    assert.deepStrictEqual(marker.upgrade.requiredStops, ['1.115.0']);
});

test('schema v2 omits capabilities, notes, and per-migration transaction data', () => {
    const marker = buildMarker({
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
    });
    const raw = marker as unknown as Record<string, unknown>;
    assert.strictEqual(marker.schemaVersion, MARKER_SCHEMA_VERSION);
    assert.strictEqual('capabilities' in raw, false);
    assert.strictEqual(
        'notes' in (marker.compatibility as unknown as Record<string, unknown>),
        false,
    );
    assert.strictEqual(
        'transaction' in
            (marker.migrations.files[0] as unknown as Record<string, unknown>),
        false,
    );
});

test('carried floor keeps the highest minimum previous version', () => {
    const marker = buildMarker({
        ...base,
        migrations: noMigrations,
        migrationDetails: [],
        ...checkedSurfaces,
        upgrade: {
            consulted: true,
            minPreviousVersion: '1.100.0',
            requiredStop: false,
            note: null,
        },
        carriedFloor: {
            minPreviousVersion: '1.105.0',
            sourceVersion: '1.106.0',
            kind: 'minPrevious',
        },
    });
    assert.strictEqual(marker.upgrade.minPreviousVersion, '1.105.0');
});

test('ownExpandContractFloor matches the marker floor', () => {
    const input = {
        ...base,
        migrations: migration,
        migrationDetails,
        ...checkedSurfaces,
        sqlLint: { ran: true, breaking: true, findings: ['drop-column'] },
        aiReview: {
            rollingUpdateSafe: true as const,
            recommendedStrategy: 'RollingUpdate' as const,
            summary: 'cleared',
        },
        expandContractFloor: '1.100.0',
    };
    const marker = buildMarker(input);
    assert.strictEqual(ownExpandContractFloor(input), '1.100.0');
    assert.strictEqual(marker.upgrade.minPreviousVersion, '1.100.0');
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`✅ ${passed} tests passed`);
