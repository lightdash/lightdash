import knex, { type Knex } from 'knex';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    BACKEND_ROOT,
    listMigrationFiles,
    MIGRATION_RUN_ENVIRONMENT,
    type MigrationFile,
} from '../database/migrationFiles';

const TEMPLATE_BUILD_TIMEOUT_MS = 9 * 60 * 1000;

export type PostgresServer = {
    host: string;
    port: number;
    user: string;
    password: string;
    adminDatabase: string;
};

export type MigratedDatabase = {
    database: Knex;
    databaseName: string;
    connectionUri: string;
    destroy: () => Promise<void>;
};

export const getAdminDatabase = (
    environment: NodeJS.ProcessEnv = process.env,
): string => environment.PGADMINDATABASE ?? 'postgres';

export const getPostgresServer = (
    environment: NodeJS.ProcessEnv = process.env,
): PostgresServer => {
    if (!environment.PGHOST) {
        throw new Error(
            'Real-schema tests need a Postgres server: set PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE',
        );
    }
    return {
        host: environment.PGHOST,
        port: Number(environment.PGPORT ?? 5432),
        user: environment.PGUSER ?? 'postgres',
        password: environment.PGPASSWORD ?? '',
        adminDatabase: getAdminDatabase(environment),
    };
};

export const toConnectionUri = (
    server: PostgresServer,
    databaseName: string,
): string =>
    `postgres://${encodeURIComponent(server.user)}:${encodeURIComponent(
        server.password,
    )}@${server.host}:${server.port}/${databaseName}`;

const connect = (
    server: PostgresServer,
    databaseName: string,
    pool: Knex.PoolConfig = { min: 0, max: 5 },
): Knex =>
    knex({
        client: 'pg',
        connection: {
            host: server.host,
            port: server.port,
            user: server.user,
            password: server.password,
            database: databaseName,
        },
        pool,
    });

export const getMigrationFingerprint = async (
    files: MigrationFile[],
): Promise<string> => {
    const hash = createHash('sha256');
    const contents = await Promise.all(
        files.map(({ filePath }) => readFile(filePath)),
    );
    files.forEach(({ name }, index) => {
        hash.update(name);
        hash.update(contents[index]);
    });
    return hash.digest('hex').slice(0, 16);
};

export const runAllMigrations = async (
    connectionUri: string,
    { timeoutMs = TEMPLATE_BUILD_TIMEOUT_MS }: { timeoutMs?: number } = {},
) =>
    new Promise<void>((resolve, reject) => {
        const output: string[] = [];
        const child = spawn('pnpm', ['run', 'migrate'], {
            cwd: BACKEND_ROOT,
            detached: true,
            env: {
                ...MIGRATION_RUN_ENVIRONMENT,
                ...process.env,
                PGCONNECTIONURI: connectionUri,
            },
        });
        const killGroup = () => {
            if (child.pid === undefined || child.exitCode !== null) return;
            try {
                process.kill(-child.pid, 'SIGKILL');
            } catch {
                child.kill('SIGKILL');
            }
        };
        process.once('exit', killGroup);
        const timer = setTimeout(() => {
            killGroup();
            reject(
                new Error(
                    `Migrations did not finish within ${timeoutMs} ms and were stopped:\n${output
                        .join('')
                        .slice(-4000)}`,
                ),
            );
        }, timeoutMs);
        child.stdout.on('data', (chunk) => output.push(String(chunk)));
        child.stderr.on('data', (chunk) => output.push(String(chunk)));
        child.on('error', (error) => {
            clearTimeout(timer);
            process.removeListener('exit', killGroup);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            process.removeListener('exit', killGroup);
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new Error(
                    `Migrations failed with exit code ${code}:\n${output
                        .join('')
                        .slice(-4000)}`,
                ),
            );
        });
    });

const databaseExists = async (admin: Knex, databaseName: string) => {
    const result = await admin.raw<{ rowCount: number }>(
        'SELECT 1 FROM pg_database WHERE datname = ?',
        [databaseName],
    );
    return (result.rowCount ?? 0) > 0;
};

const ensureTemplate = async (
    server: PostgresServer,
    templateName: string,
): Promise<void> => {
    const admin = connect(server, server.adminDatabase, { min: 1, max: 1 });
    try {
        await admin.raw('SELECT pg_advisory_lock(hashtext(?))', [templateName]);
        if (await databaseExists(admin, templateName)) return;
        const buildingName = `${templateName}_building`;
        await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            buildingName,
        ]);
        await admin.raw('CREATE DATABASE ??', [buildingName]);
        await runAllMigrations(toConnectionUri(server, buildingName));
        await admin.raw('ALTER DATABASE ?? RENAME TO ??', [
            buildingName,
            templateName,
        ]);
    } finally {
        await admin
            .raw('SELECT pg_advisory_unlock(hashtext(?))', [templateName])
            .finally(() => admin.destroy());
    }
};

export const createMigratedDatabase = async (
    server: PostgresServer = getPostgresServer(),
): Promise<MigratedDatabase> => {
    const templateName = `lightdash_schema_${await getMigrationFingerprint(
        await listMigrationFiles(),
    )}`;
    await ensureTemplate(server, templateName);

    const databaseName = `lightdash_test_${randomUUID().replaceAll('-', '')}`;
    const admin = connect(server, server.adminDatabase, { min: 0, max: 1 });
    try {
        await admin.raw('CREATE DATABASE ?? TEMPLATE ??', [
            databaseName,
            templateName,
        ]);
    } finally {
        await admin.destroy();
    }

    const database = connect(server, databaseName);
    return {
        database,
        databaseName,
        connectionUri: toConnectionUri(server, databaseName),
        destroy: async () => {
            await database.destroy();
            const cleanup = connect(server, server.adminDatabase, {
                min: 0,
                max: 1,
            });
            try {
                await cleanup.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                    databaseName,
                ]);
            } finally {
                await cleanup.destroy();
            }
        },
    };
};
