import knex, { type Knex } from 'knex';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type MigratedTestDatabase = {
    database: Knex;
    destroy: () => Promise<void>;
};

const connectionSettings = () => ({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
});

export const createMigratedTestDatabase = async (
    prefix: string,
): Promise<MigratedTestDatabase> => {
    const settings = connectionSettings();
    const databaseName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
    const admin = knex({
        client: 'pg',
        connection: {
            ...settings,
            database: process.env.PGDATABASE ?? 'postgres',
        },
    });
    await admin.raw('CREATE DATABASE ??', [databaseName]);
    execFileSync('pnpm', ['migrate'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PGCONNECTIONURI: `postgres://${encodeURIComponent(
                settings.user ?? '',
            )}:${encodeURIComponent(settings.password ?? '')}@${settings.host}:${
                settings.port
            }/${databaseName}`,
        },
        stdio: 'pipe',
    });
    const database = knex({
        client: 'pg',
        connection: { ...settings, database: databaseName },
        pool: { min: 0, max: 6 },
    });
    return {
        database,
        destroy: async () => {
            await database.destroy();
            await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                databaseName,
            ]);
            await admin.destroy();
        },
    };
};
