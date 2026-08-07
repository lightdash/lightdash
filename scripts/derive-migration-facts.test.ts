import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    deriveMigrationFact,
    deriveMigrationFactWithDiagnostics,
    isSystemCatalogRelation,
    migrationContainsBackfill,
} from './derive-migration-facts';
import type { MigrationFact, TableAccess } from './preflight';

const savedChartTimezoneSource = [
    "import { Knex } from 'knex';",
    "const TABLE = 'saved_queries_versions';",
    "const COLUMN = 'timezone';",
    "const PROJECT_TIMEZONE_SETTING = 'project_timezone';",
    'const BATCH_SIZE = 10000;',
    'export const config = { transaction: false };',
    'export async function up(knex: Knex): Promise<void> {',
    '    await knex.schema.alterTable(TABLE, (table) => {',
    '        table.text(COLUMN).defaultTo(PROJECT_TIMEZONE_SETTING);',
    '    });',
    '    let updatedInPass: number;',
    '    do {',
    '        updatedInPass = await knex(TABLE)',
    '            .update({ [COLUMN]: PROJECT_TIMEZONE_SETTING })',
    "            .whereIn('ctid', knex(TABLE).select('ctid').whereNull(COLUMN).limit(BATCH_SIZE));",
    '    } while (updatedInPass > 0);',
    '    await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [',
    '        TABLE,',
    "        'saved_queries_versions_timezone_not_null',",
    '    ]);',
    '}',
    'export async function down(knex: Knex): Promise<void> {',
    '    await knex(TABLE).update({ timezone: null });',
    '}',
].join('\n');

const savedQueriesProjectSource = [
    "import { Knex } from 'knex';",
    'export const config = { transaction: false };',
    "const SavedQueriesTableName = 'saved_queries';",
    'const BatchSize = 1000;',
    "const LockTimeout = '5s';",
    'async function addProjectUuidColumn(knex: Knex): Promise<void> {',
    '    await knex.transaction(async (trx) => {',
    "        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);",
    '        await trx.raw(`ALTER TABLE ${SavedQueriesTableName} ADD COLUMN project_uuid uuid`);',
    '    });',
    '}',
    'async function backfillBatch(knex: Knex): Promise<void> {',
    '    await knex.transaction(async (trx) => {',
    "        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);",
    '        await trx.raw<{ rows: unknown[] }>(`',
    '            WITH batch AS (',
    '                SELECT saved_queries.saved_query_id',
    '                FROM ${SavedQueriesTableName} AS saved_queries',
    '                LEFT JOIN spaces AS direct_spaces',
    '                    ON direct_spaces.space_id = saved_queries.space_id',
    '                LEFT JOIN projects AS direct_projects',
    '                    ON direct_projects.project_id = direct_spaces.project_id',
    '                LEFT JOIN dashboards',
    '                    ON dashboards.dashboard_uuid = saved_queries.dashboard_uuid',
    '                LEFT JOIN spaces AS dashboard_spaces',
    '                    ON dashboard_spaces.space_id = dashboards.space_id',
    '                LEFT JOIN projects AS dashboard_projects',
    '                    ON dashboard_projects.project_id = dashboard_spaces.project_id',
    '                LIMIT ${BatchSize}',
    '            ), updated AS (',
    '                UPDATE ${SavedQueriesTableName} AS saved_queries',
    '                SET project_uuid = NULL',
    '                FROM batch',
    '                WHERE saved_queries.project_uuid IS DISTINCT FROM batch.project_uuid',
    '                RETURNING saved_queries.saved_query_id',
    '            )',
    '            SELECT COUNT(*) FROM updated',
    '        `);',
    '    });',
    '}',
    'export async function up(knex: Knex): Promise<void> {',
    '    await addProjectUuidColumn(knex);',
    '    await backfillBatch(knex);',
    '}',
    'export async function down(knex: Knex): Promise<void> {',
    '    await knex.schema.alterTable(SavedQueriesTableName, () => undefined);',
    '}',
].join('\n');

const incompleteUsersSource = [
    "import { type Knex } from 'knex';",
    'export async function up(knex: Knex): Promise<void> {',
    "    await knex('users')",
    "        .where('is_setup_complete', false)",
    '        .update({ is_setup_complete: true });',
    '}',
    'export async function down(_knex: Knex): Promise<void> {}',
].join('\n');

const pivotRowsSource = [
    "import { Knex } from 'knex';",
    "const SavedChartVersionsTableName = 'saved_queries_versions';",
    "const PivotRowsColumnName = 'pivot_rows';",
    'export async function up(knex: Knex): Promise<void> {',
    '    await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {',
    "        table.specificType(PivotRowsColumnName, 'TEXT[]').nullable();",
    '    });',
    '}',
    'export async function down(knex: Knex): Promise<void> {',
    '    await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {',
    '        table.dropColumn(PivotRowsColumnName);',
    '    });',
    '}',
].join('\n');

const dynamicTableSource = [
    "import { Knex } from 'knex';",
    'const newTableSingularIndexes = {',
    "    dashboard_versions: ['dashboard_id', 'updated_by_user_uuid'],",
    "    spaces: ['project_id'],",
    '};',
    'export async function up(knex: Knex): Promise<void> {',
    '    async function createIndex(table: string, columns: string[]) {',
    '        if (await knex.schema.hasTable(table)) {',
    '            await knex.schema.alterTable(table, (tableBuilder) => {',
    '                columns.forEach((column) => tableBuilder.index([column]));',
    '            });',
    '        }',
    '    }',
    '    await Promise.all(',
    '        Object.entries(newTableSingularIndexes).map(([table, columns]) =>',
    '            createIndex(table, columns),',
    '        ),',
    '    );',
    '}',
].join('\n');

const insertSelectSource = [
    "import { Knex } from 'knex';",
    "const METRICS_TREES_TABLE = 'metrics_trees';",
    "const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';",
    'export async function up(knex: Knex): Promise<void> {',
    '    await knex.raw(`',
    '        INSERT INTO ${METRICS_TREES_TABLE} (project_uuid)',
    '        SELECT project_uuid FROM ${METRICS_TREE_EDGES_TABLE}',
    '    `);',
    '}',
].join('\n');

const ACCESS_ORDER: TableAccess[] = ['read', 'write', 'ddl'];

function structuralFact(fact: MigrationFact): unknown {
    return {
        migration: fact.migration,
        introducedIn: fact.introducedIn,
        runsInTransaction: fact.runsInTransaction,
        resumable: fact.resumable,
        batchSize: fact.batchSize,
        lockTimeout: fact.lockTimeout,
        tables: fact.tables.map((table) => ({
            name: table.name,
            access: ACCESS_ORDER.filter((access) =>
                table.access.includes(access),
            ),
        })),
    };
}

const oracle = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'migration-facts.json'), 'utf8'),
) as { migrationFacts: MigrationFact[] };

const fixtures = [
    {
        migration: '20260610120000_default_saved_chart_timezone_to_project',
        source: savedChartTimezoneSource,
    },
    {
        migration: '20260721112833_add_project_uuid_to_saved_queries',
        source: savedQueriesProjectSource,
    },
    {
        migration:
            '20260731111612_grandfather_existing_incomplete_users_setup_complete',
        source: incompleteUsersSource,
    },
];

for (const fixture of fixtures) {
    const expected = oracle.migrationFacts.find(
        (fact) => fact.migration === fixture.migration,
    );
    assert.ok(expected, `missing oracle fact for ${fixture.migration}`);
    const derived = deriveMigrationFact(
        fixture.source,
        fixture.migration,
        expected.introducedIn,
    );
    assert.deepStrictEqual(structuralFact(derived), structuralFact(expected));
    assert.strictEqual(derived.backfill, null);
    assert.strictEqual(derived.notes, null);
}

const savedChartFact = deriveMigrationFact(
    savedChartTimezoneSource,
    '20260610120000_default_saved_chart_timezone_to_project',
    '0.3138.0',
);
assert.deepStrictEqual(savedChartFact.tables[0].expectedLockModes, [
    'RowExclusiveLock',
    'AccessExclusiveLock',
]);

const projectFact = deriveMigrationFact(
    savedQueriesProjectSource,
    '20260721112833_add_project_uuid_to_saved_queries',
    '0.3477.0',
);
assert.deepStrictEqual(projectFact.tables, [
    {
        name: 'saved_queries',
        access: ['write', 'ddl'],
        expectedLockModes: ['RowExclusiveLock', 'AccessExclusiveLock'],
    },
    {
        name: 'spaces',
        access: ['read'],
        expectedLockModes: ['AccessShareLock'],
    },
    {
        name: 'projects',
        access: ['read'],
        expectedLockModes: ['AccessShareLock'],
    },
    {
        name: 'dashboards',
        access: ['read'],
        expectedLockModes: ['AccessShareLock'],
    },
]);

const pivotFact = deriveMigrationFact(
    pivotRowsSource,
    '20260723123000_add_pivot_rows_to_saved_chart_versions',
    'provided-by-caller',
);
assert.strictEqual(pivotFact.introducedIn, 'provided-by-caller');
assert.deepStrictEqual(pivotFact.tables, [
    {
        name: 'saved_queries_versions',
        access: ['ddl'],
        expectedLockModes: ['AccessExclusiveLock'],
    },
]);
assert.strictEqual(migrationContainsBackfill(pivotRowsSource), false);

assert.strictEqual(migrationContainsBackfill(savedChartTimezoneSource), true);
assert.strictEqual(migrationContainsBackfill(savedQueriesProjectSource), true);
assert.strictEqual(migrationContainsBackfill(incompleteUsersSource), true);
assert.strictEqual(migrationContainsBackfill(insertSelectSource), true);

const dynamicResult = deriveMigrationFactWithDiagnostics(
    dynamicTableSource,
    '20240604140542_add_missing_indexes_for_dashboards_query',
    'provided-by-caller',
);
assert.deepStrictEqual(dynamicResult.fact.tables, []);
assert.strictEqual(dynamicResult.unclassifiedConstructs.length, 1);
assert.match(dynamicResult.unclassifiedConstructs[0], /alterTable\(table/);

const catalogProbeSource = `
export async function up(knex: Knex): Promise<void> {
    await knex.raw(\`SELECT 1 FROM pg_constraint WHERE conname = 'x'\`);
    await knex.raw(\`SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid\`);
    await knex.raw(\`SELECT 1 FROM information_schema.table_constraints\`);
    await knex.raw(\`UPDATE scheduler_log SET job_id = 1\`);
}
`;

const catalogResult = deriveMigrationFactWithDiagnostics(
    catalogProbeSource,
    '20260428153355_add_primary_keys_to_analytics_and_scheduler_log',
    'provided-by-caller',
);
assert.deepStrictEqual(catalogResult.fact.tables, [
    {
        name: 'scheduler_log',
        access: ['write'],
        expectedLockModes: ['RowExclusiveLock'],
    },
]);

assert.strictEqual(isSystemCatalogRelation('pg_class'), true);
assert.strictEqual(isSystemCatalogRelation('pg_catalog.pg_class'), true);
assert.strictEqual(
    isSystemCatalogRelation('information_schema.table_constraints'),
    true,
);
assert.strictEqual(isSystemCatalogRelation('projects'), false);
assert.strictEqual(isSystemCatalogRelation('graphile_worker.jobs'), false);

console.log('derive-migration-facts: tests passed');
