import knex, { type Knex } from 'knex';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    BACKEND_ROOT,
    listMigrationFiles,
    MIGRATION_RUN_ENVIRONMENT,
    type MigrationFile,
} from '../../database/migrationFiles';
import {
    getPostgresServer,
    toConnectionUri,
} from '../../testing/migratedDatabase';
import {
    findReusedColumnNames,
    parseAllowList,
    type SchemaColumn,
} from './columnNames';

const ALLOW_LIST_PATH = path.join(
    BACKEND_ROOT,
    'src/database/columnNameReuseAllowList.json',
);

const readArgument = (name: string, fallback: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
};

const listBaseMigrationNames = (baseRef: string): Set<string> => {
    const repositoryRoot = execFileSync(
        'git',
        ['rev-parse', '--show-toplevel'],
        {
            cwd: BACKEND_ROOT,
        },
    )
        .toString()
        .trim();
    const paths = execFileSync(
        'git',
        [
            'ls-tree',
            '-r',
            '--name-only',
            baseRef,
            '--',
            'packages/backend/src/database/migrations',
            'packages/backend/src/ee/database/migrations',
        ],
        { cwd: repositoryRoot },
    )
        .toString()
        .split('\n')
        .filter(Boolean);
    return new Set(paths.map((filePath) => path.basename(filePath)));
};

const migrationSource = (
    files: MigrationFile[],
): Knex.MigratorConfig['migrationSource'] => ({
    getMigrations: async () => files,
    getMigrationName: (file: MigrationFile) => file.name,
    getMigration: async (file: MigrationFile) => import(file.filePath),
});

const readColumns = async (database: Knex): Promise<SchemaColumn[]> => {
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

const main = async () => {
    Object.entries(MIGRATION_RUN_ENVIRONMENT).forEach(([name, value]) => {
        process.env[name] = process.env[name] ?? value;
    });
    const baseRef = readArgument('base', 'origin/main');
    const baseMigrationNames = listBaseMigrationNames(baseRef);
    const files = await listMigrationFiles();
    const addedFiles = files.filter(
        ({ name }) => !baseMigrationNames.has(name),
    );

    if (addedFiles.length === 0) {
        console.info(`No migrations added since ${baseRef}.`);
        return;
    }
    console.info(
        `Migrations added since ${baseRef}:\n${addedFiles
            .map(({ name }) => `  ${name}`)
            .join('\n')}`,
    );

    const allowList = parseAllowList(await readFile(ALLOW_LIST_PATH, 'utf8'));
    const server = getPostgresServer();
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
                files.filter(({ name }) => baseMigrationNames.has(name)),
            ),
        });
        const baseColumns = await readColumns(database);
        await database.migrate.latest({
            migrationSource: migrationSource(files),
        });
        const headColumns = await readColumns(database);

        const reused = findReusedColumnNames({
            baseColumns,
            headColumns,
            allowList,
        });
        if (reused.length > 0) {
            console.error(
                `New columns reuse names that already exist in the base schema. The previous release can read them as ambiguous:\n${reused
                    .map(
                        ({ tableName, columnName, existingTables }) =>
                            `  ${tableName}.${columnName} (already on ${existingTables.join(', ')})`,
                    )
                    .join(
                        '\n',
                    )}\nRename the column, or add it to src/database/columnNameReuseAllowList.json with a reason.`,
            );
            process.exitCode = 1;
            return;
        }
        console.info('No new column reuses a name from the base schema.');
    } finally {
        await database.destroy();
        await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            databaseName,
        ]);
        await admin.destroy();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
