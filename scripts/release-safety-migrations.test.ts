import * as assert from 'node:assert';
import {
    analyzeMigrationSource,
    readMigrationMetadata,
} from './release-safety-migrations';

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

test('analyzer reads core tables and forward heaviness only', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000000_users.ts',
        `
            import { Knex } from 'knex';
            const USERS = 'users';
            export async function up(knex: Knex): Promise<void> {
                await knex.schema.alterTable(USERS, (table) => {
                    table.string('nickname');
                    table.index(['nickname']);
                });
                await knex(USERS).whereNull('nickname').update({ nickname: '' });
            }
            export async function down(knex: Knex): Promise<void> {
                await knex.schema.dropTable('must_not_appear');
            }
        `,
    );
    assert.deepStrictEqual(result, {
        migration: {
            name: '20260810000000_users.ts',
            edition: 'core',
            tables: ['users'],
            heaviness: {
                locksTable: true,
                rewritesTable: true,
                scansTable: true,
            },
        },
        complete: true,
    });
});

test('analyzer extracts static raw SQL from an EE migration', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/ee/database/migrations/20260810000001_events.ts',
        `
            export const breaking = { reason: "requires a coordinated rollout", requiredStop: false };
            export async function up(knex) {
                await knex.raw('CREATE INDEX events_created_at_idx ON events (created_at)');
            }
        `,
    );
    assert.deepStrictEqual(result.migration, {
        name: '20260810000001_events.ts',
        edition: 'ee',
        tables: ['events'],
        heaviness: {
            locksTable: true,
            rewritesTable: false,
            scansTable: true,
        },
    });
    assert.strictEqual(result.complete, true);
});

test('dynamic raw SQL degrades unknown dimensions and completeness', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000002_dynamic.ts',
        `export async function up(knex) { await knex.raw(buildSql()); }`,
    );
    assert.deepStrictEqual(result.migration.heaviness, {
        locksTable: 'unknown',
        rewritesTable: 'unknown',
        scansTable: 'unknown',
    });
    assert.strictEqual(result.complete, false);
});

test('IO reads the requested ref and represents unreadable paths honestly', () => {
    const existing =
        'packages/backend/src/database/migrations/20250602185100_add_treemap_to_chart_type.ts';
    const missing =
        'packages/backend/src/ee/database/migrations/29990101000000_missing.ts';
    const logs: string[] = [];
    const result = readMigrationMetadata({
        paths: [missing, existing],
        ref: 'HEAD',
        log: (message) => logs.push(message),
    });
    assert.deepStrictEqual(
        result.migrations.map((migration) => migration.name),
        [
            '20250602185100_add_treemap_to_chart_type.ts',
            '29990101000000_missing.ts',
        ],
    );
    assert.deepStrictEqual(result.migrations[1], {
        name: '29990101000000_missing.ts',
        edition: 'ee',
        tables: [],
        heaviness: {
            locksTable: 'unknown',
            rewritesTable: 'unknown',
            scansTable: 'unknown',
        },
    });
    assert.strictEqual(result.complete, false);
    assert.ok(logs.some((message) => message.includes('could not read HEAD:')));
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
