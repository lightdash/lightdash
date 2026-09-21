import knex from 'knex';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

console.log = (...values: unknown[]) => {
    process.stderr.write(`${values.map(String).join(' ')}\n`);
};

type DatabaseCommand = 'create' | 'drop' | 'apply-through';

const requireArgument = (name: string): string => {
    const index = process.argv.indexOf(name);
    const value = index === -1 ? undefined : process.argv[index + 1];
    if (!value) throw new Error(`${name} is required`);
    return value;
};

const quoteIdentifier = (identifier: string): string =>
    `"${identifier.replaceAll('"', '""')}"`;

const connectionForDatabase = (
    connectionUri: string,
    database: string,
): string => {
    const url = new URL(connectionUri);
    url.pathname = `/${database}`;
    return url.toString();
};

const createDatabase = async (adminUri: string, databaseName: string) => {
    const client = new Client({ connectionString: adminUri });
    await client.connect();
    try {
        const template = process.argv.includes('--template')
            ? requireArgument('--template')
            : undefined;
        await client.query(
            `CREATE DATABASE ${quoteIdentifier(databaseName)}${template ? ` TEMPLATE ${quoteIdentifier(template)}` : ''}`,
        );
    } finally {
        await client.end();
    }
    return {
        operation: 'create',
        databaseName,
        connectionUri: connectionForDatabase(adminUri, databaseName),
    } as const;
};

const dropDatabase = async (adminUri: string, databaseName: string) => {
    const client = new Client({ connectionString: adminUri });
    await client.connect();
    try {
        await client.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [databaseName],
        );
        await client.query(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
        );
    } finally {
        await client.end();
    }
    return { operation: 'drop', databaseName } as const;
};

const migrationFiles = async (directory: string): Promise<string[]> =>
    (await fs.readdir(directory))
        .filter((file) => /^\d{14}_.+\.ts$/.test(file))
        .sort();

const completedMigrations = async (
    database: ReturnType<typeof knex>,
): Promise<string[]> => {
    if (!(await database.schema.hasTable('knex_migrations'))) return [];
    const rows = await database<{ name: string }>('knex_migrations')
        .select('name')
        .orderBy('id');
    return rows.map(({ name }) => name);
};

const applyThrough = async (connectionUri: string, through: string) => {
    const directory = path.resolve(
        import.meta.dirname,
        '../database/migrations',
    );
    const files = await migrationFiles(directory);
    const target = through === 'latest' ? files.at(-1) : through;
    if (!target || !files.includes(target)) {
        throw new Error(`Migration boundary not found: ${through}`);
    }
    const targetIndex = files.indexOf(target);
    const database = knex({
        client: 'pg',
        connection: connectionUri,
        migrations: {
            directory,
            extension: 'ts',
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
            disableMigrationsListValidation: true,
        },
        pool: { min: 0, max: 2 },
    });
    try {
        const completedBefore = new Set(await completedMigrations(database));
        const pendingThroughTarget = files
            .slice(0, targetIndex + 1)
            .filter((file) => !completedBefore.has(file));
        await pendingThroughTarget.reduce(async (previousMigration, name) => {
            await previousMigration;
            await database.migrate.up({ name });
        }, Promise.resolve());
        const completedAfter = await completedMigrations(database);
        const completedSet = new Set(completedAfter);
        const missing = files
            .slice(0, targetIndex + 1)
            .filter((file) => !completedSet.has(file));
        const completedPastBoundary = completedAfter.filter(
            (file) => files.includes(file) && files.indexOf(file) > targetIndex,
        );
        const ledgerBoundary = completedAfter.at(-1);
        if (
            missing.length > 0 ||
            completedPastBoundary.length > 0 ||
            ledgerBoundary !== target
        ) {
            throw new Error(
                JSON.stringify({
                    missing,
                    completedPastBoundary,
                    ledgerBoundary,
                    target,
                }),
            );
        }
        return {
            operation: 'apply-through',
            target,
            applied: pendingThroughTarget,
            ledgerBoundary,
        } as const;
    } finally {
        await database.destroy();
    }
};

const main = async () => {
    const command = process.argv[2] as DatabaseCommand | undefined;
    const connectionUri = requireArgument('--connection-uri');
    if (command === 'create') {
        return createDatabase(
            connectionUri,
            requireArgument('--database-name'),
        );
    }
    if (command === 'drop') {
        return dropDatabase(connectionUri, requireArgument('--database-name'));
    }
    if (command === 'apply-through') {
        return applyThrough(connectionUri, requireArgument('--through'));
    }
    throw new Error(`Unknown database command: ${command ?? ''}`);
};

main()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
        process.stderr.write(
            `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        process.exitCode = 1;
    });
