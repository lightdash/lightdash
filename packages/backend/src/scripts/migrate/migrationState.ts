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
    offending: string[];
    classification:
        | 'up-to-date'
        | 'database-behind'
        | 'database-ahead'
        | 'diverged';
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

const isValidMigrationTimestamp = (timestamp: string): boolean => {
    const year = Number(timestamp.slice(0, 4));
    const month = Number(timestamp.slice(4, 6));
    const day = Number(timestamp.slice(6, 8));
    const hour = Number(timestamp.slice(8, 10));
    const minute = Number(timestamp.slice(10, 12));
    const second = Number(timestamp.slice(12, 14));
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ][month - 1];
    return (
        year > 0 &&
        daysInMonth !== undefined &&
        day >= 1 &&
        day <= daysInMonth &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59 &&
        second >= 0 &&
        second <= 59
    );
};

const getPlausibleMigrationTimestamp = (
    migration: string,
    loadExtensions: ReadonlySet<string>,
): string | null => {
    if (path.basename(migration) !== migration) {
        return null;
    }
    const extension = path.extname(migration);
    if (!loadExtensions.has(extension)) {
        return null;
    }
    const migrationName = migration.slice(0, -extension.length);
    const match = /^(\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*$/.exec(migrationName);
    if (match === null || !isValidMigrationTimestamp(match[1])) {
        return null;
    }
    return match[1];
};

const classifyMigrationState = (
    files: string[],
    pending: string[],
    missing: string[],
    config: Knex.MigratorConfig,
): Pick<KnexMigrationState, 'classification' | 'offending'> => {
    if (missing.length === 0) {
        return {
            classification:
                pending.length === 0 ? 'up-to-date' : 'database-behind',
            offending: [],
        };
    }
    const newestLocalMigration = files[files.length - 1];
    if (newestLocalMigration === undefined) {
        return { classification: 'diverged', offending: missing };
    }
    const loadExtensions = new Set(
        getLoadExtensions(config).map((extension) =>
            extension.startsWith('.') ? extension : `.${extension}`,
        ),
    );
    const newestLocalTimestamp = getPlausibleMigrationTimestamp(
        newestLocalMigration,
        loadExtensions,
    );
    if (newestLocalTimestamp === null) {
        return { classification: 'diverged', offending: missing };
    }
    const offending: string[] = [];
    let previousMissingTimestamp = newestLocalTimestamp;
    for (const migration of missing) {
        const migrationTimestamp = getPlausibleMigrationTimestamp(
            migration,
            loadExtensions,
        );
        if (
            migrationTimestamp === null ||
            migration <= newestLocalMigration ||
            migrationTimestamp <= newestLocalTimestamp ||
            migrationTimestamp <= previousMissingTimestamp
        ) {
            offending.push(migration);
        }
        if (migrationTimestamp !== null) {
            previousMissingTimestamp = migrationTimestamp;
        }
    }
    return offending.length === 0
        ? { classification: 'database-ahead', offending }
        : { classification: 'diverged', offending };
};

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
    const classification = classifyMigrationState(
        files,
        pending,
        missing,
        config,
    );
    return {
        completed,
        pending,
        missing,
        ...classification,
    };
};
