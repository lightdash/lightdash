import { type Knex } from 'knex';
import {
    checkColumnNames,
    type CheckedMigration,
} from '../../../scripts/check-column-names/checkColumnNames';
import { getPostgresServer } from '../../../testing/migratedDatabase';

const migration = (
    name: string,
    up: (knex: Knex) => Promise<void>,
): CheckedMigration => ({
    name,
    load: async () => ({ up, down: async () => {} }),
});

const baseMigrations = [
    migration('20260101000000_create_fixture_organizations.ts', (knex) =>
        knex.schema.createTable('fixture_organizations', (table) => {
            table.uuid('organization_uuid').primary();
            table.text('name').notNullable();
        }),
    ),
    migration('20260101000100_create_fixture_projects.ts', (knex) =>
        knex.schema.createTable('fixture_projects', (table) => {
            table.uuid('project_uuid').primary();
            table.integer('project_id').notNullable();
            table.text('name').notNullable();
        }),
    ),
    migration(
        '20260101000200_create_fixture_organization_credentials.ts',
        (knex) =>
            knex.schema.createTable(
                'fixture_organization_warehouse_credentials',
                (table) => {
                    table
                        .uuid('organization_warehouse_credentials_uuid')
                        .primary();
                },
            ),
    ),
    migration(
        '20260101000300_create_fixture_warehouse_credentials.ts',
        (knex) =>
            knex.schema.createTable(
                'fixture_warehouse_credentials',
                (table) => {
                    table.uuid('warehouse_credentials_uuid').primary();
                    table.integer('project_id').notNullable();
                },
            ),
    ),
];

const headMigration = migration(
    '20260923100000_add_connection_columns_to_fixture_credentials.ts',
    (knex) =>
        knex.schema.alterTable('fixture_warehouse_credentials', (table) => {
            table.text('name').nullable();
            table.uuid('organization_warehouse_credentials_uuid').nullable();
            table.timestamp('superseded_at').nullable();
        }),
);

const baseMigrationNames = new Set(baseMigrations.map(({ name }) => name));

describe('column name check on a real schema', () => {
    test('reports new columns that reuse a base column name, as A1 did', async () => {
        const reused = await checkColumnNames({
            server: getPostgresServer(),
            migrations: [...baseMigrations, headMigration],
            baseMigrationNames,
            allowList: [],
        });

        expect(
            reused
                .map(
                    ({ tableName, columnName }) => `${tableName}.${columnName}`,
                )
                .sort(),
        ).toEqual([
            'fixture_warehouse_credentials.name',
            'fixture_warehouse_credentials.organization_warehouse_credentials_uuid',
        ]);
        expect(
            reused.find(({ columnName }) => columnName === 'name')
                ?.existingTables,
        ).toEqual(
            expect.arrayContaining([
                'fixture_organizations',
                'fixture_projects',
            ]),
        );
        expect(
            reused.find(
                ({ columnName }) =>
                    columnName === 'organization_warehouse_credentials_uuid',
            )?.existingTables,
        ).toEqual(['fixture_organization_warehouse_credentials']);
    });

    test('passes an allow-listed column and a column with a new name', async () => {
        const reused = await checkColumnNames({
            server: getPostgresServer(),
            migrations: [...baseMigrations, headMigration],
            baseMigrationNames,
            allowList: [
                {
                    column: 'fixture_warehouse_credentials.name',
                    reason: 'Every read of this name is qualified by its table',
                },
                {
                    column: 'fixture_warehouse_credentials.organization_warehouse_credentials_uuid',
                    reason: 'Every read of this name is qualified by its table',
                },
            ],
        });

        expect(reused).toEqual([]);
    });

    test('reports nothing when the head adds no migration', async () => {
        const reused = await checkColumnNames({
            server: getPostgresServer(),
            migrations: baseMigrations,
            baseMigrationNames,
            allowList: [],
        });

        expect(reused).toEqual([]);
    });
});
