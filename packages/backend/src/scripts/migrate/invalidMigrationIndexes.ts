import { type Knex } from 'knex';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type InvalidIndexRow = {
    name: string;
};

type InvalidIndexQueryResult = {
    rows: InvalidIndexRow[];
};

export type CleanupInvalidMigrationIndexesArgs = {
    database: Knex;
    migrationConfig: Knex.MigratorConfig;
    pendingMigrationNames: readonly string[];
    log: (message: string) => void;
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

const getLoadExtensions = (config: Knex.MigratorConfig): Set<string> =>
    new Set(
        (config.loadExtensions ?? [`.${config.extension ?? 'js'}`]).map(
            (extension) =>
                extension.startsWith('.') ? extension : `.${extension}`,
        ),
    );

const extractConcurrentIndexNames = (source: string): Set<string> => {
    const names = new Set<string>();
    const expression =
        /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"((?:""|[^"])+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+ON\b/gi;
    for (const match of source.matchAll(expression)) {
        const quotedName = match[1];
        const unquotedName = match[2];
        if (quotedName !== undefined) {
            names.add(quotedName.replace(/""/g, '"'));
        } else if (unquotedName !== undefined) {
            names.add(unquotedName.toLowerCase());
        }
    }
    return names;
};

const findPendingMigrationIndexNames = async (
    config: Knex.MigratorConfig,
    pendingMigrationNames: readonly string[],
): Promise<Set<string>> => {
    const pendingNames = new Set(pendingMigrationNames);
    const loadExtensions = getLoadExtensions(config);
    const sources = await Promise.all(
        getMigrationDirectories(config).map(async (directory) => {
            const entries = await fs.readdir(directory, {
                withFileTypes: true,
            });
            const matchingFiles = entries.filter(
                (entry) =>
                    entry.isFile() &&
                    pendingNames.has(entry.name) &&
                    loadExtensions.has(path.extname(entry.name)),
            );
            return Promise.all(
                matchingFiles.map((entry) =>
                    fs.readFile(path.join(directory, entry.name), 'utf8'),
                ),
            );
        }),
    );
    return sources.flat().reduce<Set<string>>((names, source) => {
        extractConcurrentIndexNames(source).forEach((name) => names.add(name));
        return names;
    }, new Set());
};

export const cleanupInvalidMigrationIndexes = async ({
    database,
    migrationConfig,
    pendingMigrationNames,
    log,
}: CleanupInvalidMigrationIndexesArgs): Promise<void> => {
    const pendingIndexNames = await findPendingMigrationIndexNames(
        migrationConfig,
        pendingMigrationNames,
    );
    if (pendingIndexNames.size === 0) {
        return;
    }
    const names = [...pendingIndexNames];
    const placeholders = names.map(() => '?').join(', ');
    const result = await database.raw<InvalidIndexQueryResult>(
        `SELECT pg_class.relname AS name
         FROM pg_index
         JOIN pg_class ON pg_class.oid = pg_index.indexrelid
         JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
         WHERE pg_index.indisvalid = false
           AND pg_class.relname IN (${placeholders})
           AND pg_namespace.nspname = ANY(current_schemas(false))
           AND pg_table_is_visible(pg_class.oid)`,
        names,
    );
    const invalidIndexNames = new Set(
        result.rows
            .map((row) => row.name)
            .filter((name) => pendingIndexNames.has(name)),
    );
    await Promise.all(
        [...invalidIndexNames].map((name) => {
            log(`Dropping invalid index left by pending migration: ${name}`);
            return database.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [name]);
        }),
    );
};
