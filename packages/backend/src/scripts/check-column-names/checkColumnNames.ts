import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    toConnectionUri,
    type PostgresServer,
} from '../../testing/migratedDatabase';
import {
    findReusedColumnNames,
    type ColumnNameAllowListEntry,
    type ReusedColumnName,
    type SchemaColumn,
} from './columnNames';

export type CheckedMigration = {
    name: string;
    load: () => Promise<Knex.Migration>;
};

const migrationSource = (
    migrations: CheckedMigration[],
): Knex.MigratorConfig['migrationSource'] => ({
    getMigrations: async () => migrations,
    getMigrationName: (migration: CheckedMigration) => migration.name,
    getMigration: (migration: CheckedMigration) => migration.load(),
});

export const readColumns = async (database: Knex): Promise<SchemaColumn[]> => {
    const result = await database.raw<{
        rows: { table_name: string; column_name: string }[];
    }>(
        `SELECT relation.relname AS table_name, attribute.attname AS column_name
         FROM pg_attribute attribute
         JOIN pg_class relation ON relation.oid = attribute.attrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped`,
    );
    return result.rows.map((row) => ({
        tableName: row.table_name,
        columnName: row.column_name,
    }));
};

export const checkColumnNames = async ({
    server,
    migrations,
    baseMigrationNames,
    allowList,
}: {
    server: PostgresServer;
    migrations: CheckedMigration[];
    baseMigrationNames: Set<string>;
    allowList: ColumnNameAllowListEntry[];
}): Promise<ReusedColumnName[]> => {
    const databaseName = `lightdash_column_check_${randomUUID().replaceAll('-', '')}`;
    const admin = knex({
        client: 'pg',
        connection: toConnectionUri(server, server.adminDatabase),
        pool: { min: 0, max: 1 },
    });
    await admin.raw('CREATE DATABASE ??', [databaseName]);
    const database = knex({
        client: 'pg',
        connection: toConnectionUri(server, databaseName),
    });
    try {
        await database.migrate.latest({
            migrationSource: migrationSource(
                migrations.filter(({ name }) => baseMigrationNames.has(name)),
            ),
        });
        const baseColumns = await readColumns(database);
        await database.migrate.latest({
            migrationSource: migrationSource(migrations),
        });
        const headColumns = await readColumns(database);
        return findReusedColumnNames({ baseColumns, headColumns, allowList });
    } finally {
        await database.destroy();
        await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            databaseName,
        ]);
        await admin.destroy();
    }
};
