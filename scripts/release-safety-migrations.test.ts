import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    analyzeMigrationSource,
    isMigrationPath,
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

const core = 'packages/backend/src/database/migrations';

test('isMigrationPath accepts a timestamped migration', () => {
    assert.strictEqual(isMigrationPath(`${core}/20260810000000_add_column.ts`), true);
    assert.strictEqual(isMigrationPath(`${core}/20260810000000_add_column.js`), true);
});

test('isMigrationPath rejects a test knex never loads', () => {
    assert.strictEqual(
        isMigrationPath(`${core}/__tests__/20260810000000_add_column.test.ts`),
        false,
    );
    assert.strictEqual(isMigrationPath(`${core}/__tests__/helpers.ts`), false);
});

test('isMigrationPath keeps a timestamped file knex does load, whatever it is called', () => {
    // Directly in the migration directory, so knex runs it. Skipping it would
    // hide a file that breaks migrations in production.
    assert.strictEqual(isMigrationPath(`${core}/20260810000000_add_column.test.ts`), true);
    assert.strictEqual(isMigrationPath(`${core}/20260810000000_add_column.spec.ts`), true);
});

test('isMigrationPath rejects an untimestamped file', () => {
    assert.strictEqual(isMigrationPath(`${core}/README.md`), false);
    assert.strictEqual(isMigrationPath(`${core}/add_column.ts`), false);
});

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
        incompleteReasons: [],
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
    assert.deepStrictEqual(result.incompleteReasons, ['parse-failure']);
});

test('column alter reports that rewrite safety needs a declaration', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000017_alter.ts',
        `
            export async function up(knex) {
                await knex.schema.alterTable('users', (table) => {
                    table.string('name', 100).alter();
                });
            }
        `,
    );
    assert.strictEqual(result.complete, false);
    assert.deepStrictEqual(result.incompleteReasons, ['column-alter']);
});

test('dynamic table arguments report an unresolved table name', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000018_table.ts',
        `
            export async function up(knex) {
                await knex.schema.createTable(getTableName(), (table) => {
                    table.uuid('user_uuid');
                });
            }
        `,
    );
    assert.strictEqual(result.complete, false);
    assert.deepStrictEqual(result.incompleteReasons, [
        'unresolved-table-name',
    ]);
});

test('raw SQL built from a local constant reads as fully as a literal', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000003_index.ts',
        `
            const TableName = 'analytics_chart_views';
            const IndexName = 'analytics_chart_views_user_uuid_timestamp_idx';
            export async function up(knex) {
                await knex.raw(\`DROP INDEX CONCURRENTLY IF EXISTS \${IndexName}\`);
                await knex.raw(
                    \`CREATE INDEX CONCURRENTLY \${IndexName} ON \${TableName} (user_uuid, timestamp)\`,
                );
            }
        `,
    );
    assert.deepStrictEqual(result.migration.tables, ['analytics_chart_views']);
    assert.deepStrictEqual(result.migration.heaviness, {
        locksTable: false,
        rewritesTable: false,
        scansTable: true,
    });
    assert.strictEqual(result.complete, true);
});

test('numeric constants substitute as readily as string ones', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/ee/database/migrations/20260810000004_bounds.ts',
        `
            const Table = 'ai_organization_settings';
            const Column = 'thread_retention_hours';
            const MIN_HOURS = 1;
            const MAX_HOURS = 876000;
            export async function up(knex) {
                await knex.raw(
                    \`ALTER TABLE \${Table} ADD CONSTRAINT \${Table}_\${Column}_range CHECK (\${Column} IS NULL OR (\${Column} >= \${MIN_HOURS} AND \${Column} <= \${MAX_HOURS}))\`,
                );
            }
        `,
    );
    assert.deepStrictEqual(result.migration.tables, [
        'ai_organization_settings',
    ]);
    assert.strictEqual(result.migration.heaviness.locksTable, true);
    assert.strictEqual(result.complete, true);
});

// The cases below pin the fail-safe direction: a reader that guesses would
// tell the upgrade gate a migration is light when it is not.
test('a nested template refuses rather than reading a fragment', () => {
    // The outer token ends at the inner backtick, leaving the fragment `${`.
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000007_nested.ts',
        'const A = `users`;\n' +
            'export async function up(knex) { await knex.raw(`${`UPDATE ${A} SET x = 1`}`); }',
    );
    assert.deepStrictEqual(result.migration.heaviness, {
        locksTable: 'unknown',
        rewritesTable: 'unknown',
        scansTable: 'unknown',
    });
    assert.strictEqual(result.complete, false);
});

test('a literal that is only part of the initializer is not a constant', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000008_partial.ts',
        `
            const SQL = 'ALTER TABLE users ' + buildRest();
            export async function up(knex) { await knex.raw(\`\${SQL}\`); }
        `,
    );
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.migration.heaviness.locksTable, 'unknown');
});

test('a shadowed name is not resolved from the outer scope', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000009_shadowed.ts',
        `
            const SQL = 'SELECT 1';
            export async function up(knex) {
                const SQL = buildDangerousSql();
                await knex.raw(\`\${SQL}\`);
            }
        `,
    );
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.migration.heaviness.rewritesTable, 'unknown');
});

test('adding a constraint scans the table unless it says NOT VALID', () => {
    const build = (suffix: string): string => `
        const Table = 'ai_agent';
        export async function up(knex) {
            await knex.raw(
                \`ALTER TABLE \${Table} ADD CONSTRAINT c CHECK (h IS NULL)${suffix}\`,
            );
        }
    `;
    const validated = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000010_check.ts',
        build(''),
    );
    assert.strictEqual(validated.complete, true);
    assert.strictEqual(validated.migration.heaviness.scansTable, true);

    const deferred = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000011_check_deferred.ts',
        build(' NOT VALID'),
    );
    assert.strictEqual(deferred.complete, true);
    assert.strictEqual(deferred.migration.heaviness.scansTable, false);
});

test('an unresolvable interpolation still degrades', () => {
    for (const body of [
        'await knex.raw(`DROP INDEX ${buildName()}`);',
        'await knex.raw(`DROP INDEX ${fromSomewhereElse}`);',
    ]) {
        const result = analyzeMigrationSource(
            'packages/backend/src/database/migrations/20260810000005_unresolvable.ts',
            `export async function up(knex) { ${body} }`,
        );
        assert.deepStrictEqual(result.migration.heaviness, {
            locksTable: 'unknown',
            rewritesTable: 'unknown',
            scansTable: 'unknown',
        });
        assert.strictEqual(result.complete, false);
    }
});

test('one unresolvable placeholder degrades the whole statement', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000006_mixed.ts',
        `
            const Table = 'events';
            export async function up(knex) {
                await knex.raw(\`TRUNCATE TABLE \${Table}_\${suffix}\`);
            }
        `,
    );
    assert.strictEqual(result.complete, false);
});

test('a deferred constraint elsewhere does not vouch for a validated one', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000012_two_adds.ts',
        `
            const T = 'users';
            export async function up(knex) {
                await knex.raw(
                    \`ALTER TABLE \${T} ADD CONSTRAINT a CHECK (x > 0); ALTER TABLE events ADD CONSTRAINT b CHECK (y > 0) NOT VALID\`,
                );
            }
        `,
    );
    assert.strictEqual(result.migration.heaviness.scansTable, true);
});

test('a comment cannot defer a constraint', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000013_commented.ts',
        `
            const T = 'users';
            export async function up(knex) {
                await knex.raw(\`-- not valid\\nALTER TABLE \${T} ADD CONSTRAINT a CHECK (x > 0)\`);
            }
        `,
    );
    assert.strictEqual(result.migration.heaviness.scansTable, true);
});

test('a parameter or pattern shadowing a constant blocks resolution', () => {
    const bodies = [
        "await (async (SQL = 'UPDATE users SET x = 1') => knex.raw(\`\${SQL}\`))();",
        'await (async (SQL) => knex.raw(\`\${SQL}\`))(buildSql());',
        'const { SQL } = opts; await knex.raw(\`\${SQL}\`);',
    ];
    for (const body of bodies) {
        const result = analyzeMigrationSource(
            'packages/backend/src/database/migrations/20260810000014_shadow.ts',
            `
                const SQL = 'SELECT 1';
                export async function up(knex) { ${body} }
            `,
        );
        assert.strictEqual(result.complete, false);
        assert.strictEqual(result.migration.heaviness.rewritesTable, 'unknown');
    }
});

test('a line continuation inside a constant is cooked away', () => {
    const result = analyzeMigrationSource(
        'packages/backend/src/database/migrations/20260810000015_continued.ts',
        "const SQL = 'UPD\\\nATE users SET x = 1';\n" +
            'export async function up(knex) { await knex.raw(`${SQL}`); }',
    );
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.migration.heaviness.rewritesTable, true);
});

test('SQL concatenated inline is not read as the whole statement', () => {
    for (const argument of [
        "'ALTER TABLE users ' + buildRest()",
        '`ALTER TABLE users ` + buildRest()',
    ]) {
        const result = analyzeMigrationSource(
            'packages/backend/src/database/migrations/20260810000016_concat.ts',
            `export async function up(knex) { await knex.raw(${argument}); }`,
        );
        assert.strictEqual(result.complete, false);
        assert.strictEqual(result.migration.heaviness.scansTable, 'unknown');
    }
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

test('IO accepts safe and breaking classifications for incomplete metadata', () => {
    for (const kind of ['safe', 'breaking'] as const) {
        const directory = mkdtempSync(
            join(tmpdir(), 'release-safety-classified-'),
        );
        const migration = `${core}/20260810000019_classified_${kind}.ts`;
        try {
            mkdirSync(join(directory, core), { recursive: true });
            writeFileSync(
                join(directory, migration),
                `
                    export const classification = { kind: '${kind}', reason: 'The author classified the type widening.' };
                    export async function up(knex) {
                        await knex.schema.alterTable('users', (table) => {
                            table.string('name', 100).alter();
                        });
                    }
                `,
            );
            execFileSync('git', ['init'], { cwd: directory });
            execFileSync('git', ['add', migration], { cwd: directory });
            execFileSync(
                'git',
                [
                    '-c',
                    'user.name=Release Safety Test',
                    '-c',
                    'user.email=release-safety@example.com',
                    'commit',
                    '-m',
                    'test fixture',
                ],
                { cwd: directory },
            );
            const previousDirectory = process.cwd();
            process.chdir(directory);
            try {
                const result = readMigrationMetadata({
                    paths: [migration],
                    ref: 'HEAD',
                });
                assert.strictEqual(result.complete, true);
                assert.strictEqual(
                    result.migrations[0].heaviness.rewritesTable,
                    'unknown',
                );
            } finally {
                process.chdir(previousDirectory);
            }
        } finally {
            rmSync(directory, { force: true, recursive: true });
        }
    }
});

test('loads and runs without repository dependency resolution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'release-safety-migration-'));
    try {
        copyFileSync(
            join(process.cwd(), 'scripts/release-safety-migrations.ts'),
            join(directory, 'analyzer.ts'),
        );
        copyFileSync(
            join(process.cwd(), 'scripts/breaking-change-declarations.ts'),
            join(directory, 'breaking-change-declarations.ts'),
        );
        writeFileSync(
            join(directory, 'run.ts'),
            `
                import { analyzeMigrationSource } from './analyzer';
                const result = analyzeMigrationSource(
                    'packages/backend/src/database/migrations/isolated.ts',
                    "export async function up(knex) { await knex.schema.alterTable('users', () => undefined); }",
                );
                process.stdout.write(JSON.stringify(result));
            `,
        );

        const output = execFileSync(
            process.execPath,
            [...process.execArgv, join(directory, 'run.ts')],
            {
                cwd: directory,
                encoding: 'utf8',
                env: { ...process.env, NODE_PATH: '' },
            },
        );
        const result = JSON.parse(output) as {
            migration: { tables: string[] };
            complete: boolean;
        };
        assert.deepStrictEqual(result.migration.tables, ['users']);
        assert.strictEqual(result.complete, true);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failed, ${passed} passed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`✅ ${passed} tests passed`);
