import { type Knex } from 'knex';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_MIGRATIONS_TABLE_NAME = 'knex_migrations';

type CompletedMigrationRow = {
    name: string;
};

export type KnexMigrationState = {
    completed: string[];
    pending: string[];
    missing: string[];
    databaseAhead: boolean;
};

const getMigrationDirectories = (
    config: Knex.MigratorConfig,
): readonly string[] => {
    if (config.directory === undefined) {
        return [];
    }
    return typeof config.directory === 'string'
        ? [config.directory]
        : config.directory;
};

const getLoadExtensions = (config: Knex.MigratorConfig): readonly string[] =>
    config.loadExtensions ?? [`.${config.extension ?? 'js'}`];

const listMigrationFiles = async (
    config: Knex.MigratorConfig,
): Promise<string[]> => {
    const loadExtensions = new Set(
        getLoadExtensions(config).map((extension) =>
            extension.startsWith('.') ? extension : `.${extension}`,
        ),
    );
    const filesByDirectory = await Promise.all(
        getMigrationDirectories(config).map(async (directory) => {
            const files = await fs.readdir(directory);
            return files.filter((file) =>
                loadExtensions.has(path.extname(file)),
            );
        }),
    );
    return filesByDirectory.flat().sort();
};

const listCompletedMigrations = async (
    database: Knex,
    config: Knex.MigratorConfig,
): Promise<string[]> => {
    const tableName = config.tableName ?? DEFAULT_MIGRATIONS_TABLE_NAME;
    const schema = config.schemaName;
    const schemaBuilder =
        schema === undefined
            ? database.schema
            : database.schema.withSchema(schema);
    if (!(await schemaBuilder.hasTable(tableName))) {
        return [];
    }
    const query = database<CompletedMigrationRow>(tableName)
        .select('name')
        .orderBy('id');
    const rows =
        schema === undefined ? await query : await query.withSchema(schema);
    return rows.map((row) => row.name);
};

export const getKnexMigrationState = async (
    database: Knex,
    config: Knex.MigratorConfig,
): Promise<KnexMigrationState> => {
    const [files, completed] = await Promise.all([
        listMigrationFiles(config),
        listCompletedMigrations(database, config),
    ]);
    const fileNames = new Set(files);
    const completedNames = new Set(completed);
    const pending = files.filter((file) => !completedNames.has(file));
    const missing = completed.filter((file) => !fileNames.has(file));
    return {
        completed,
        pending,
        missing,
        databaseAhead: missing.length > 0,
    };
};
