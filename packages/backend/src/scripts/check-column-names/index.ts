import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    BACKEND_ROOT,
    listMigrationFiles,
    MIGRATION_RUN_ENVIRONMENT,
} from '../../database/migrationFiles';
import { getPostgresServer } from '../../testing/migratedDatabase';
import { checkColumnNames } from './checkColumnNames';
import { parseAllowList } from './columnNames';

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
    const reused = await checkColumnNames({
        server: getPostgresServer(),
        migrations: files.map(({ name, filePath }) => ({
            name,
            load: () => import(filePath),
        })),
        baseMigrationNames,
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
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
