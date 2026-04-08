/**
 * Switch behaviour of database connector depending on environment
 */
import { Knex } from 'knex';
import path from 'path';
import { parse } from 'pg-connection-string';
import { lightdashConfig } from './config/lightdashConfig';

const CONNECTION = lightdashConfig.database.connectionUri
    ? parse(lightdashConfig.database.connectionUri)
    : {};

const CONNECTION_WITH_KEEPALIVE = {
    ...CONNECTION,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // Start TCP keepalive probes after 10s idle
};

export const DEFAULT_DB_MAX_CONNECTIONS = 10;

// Condition to be removed once we require Postgres vector extension
const hasEnterpriseLicense = !!lightdashConfig.license.licenseKey;

const development: Knex.Config<Knex.PgConnectionConfig> = {
    client: 'pg',
    connection: CONNECTION_WITH_KEEPALIVE,
    pool: {
        min: lightdashConfig.database.minConnections || 0,
        max:
            lightdashConfig.database.maxConnections ||
            DEFAULT_DB_MAX_CONNECTIONS,
        acquireTimeoutMillis: 30000, // (default) 30 seconds - max time the application will wait for a connection from the pool before failing (awaited connect will reject)
        createTimeoutMillis: 30000, // (default) 30 seconds - max time that the knex pool will wait for a connection to the postgres database to be created before failing (create operation is cancelled)
        destroyTimeoutMillis: 5000, // (default) 5 seconds - max time that the knex pool will wait for a connection to be destroyed before failing (new resources are created after timeout)
        idleTimeoutMillis: 30000, // (default) 30 seconds - max time that a connection can be idle (not used by the application) before being destroyed (disconnected from postgres) (only happens if minConnections is 0)
        reapIntervalMillis: 1000, // (default) 1 second - how often the pool will check for idle connections that need to be reaped
        createRetryIntervalMillis: 200, // (default) 0.2 seconds - how long the pool will wait before retrying to create a connection to postgres after a failure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterCreate: (
            conn: any,
            done: (err: Error | null, conn: any) => void,
        ) => {
            // Verify the connection is alive immediately after creation.
            // This causes tarn to discard and replace stale connections
            // (e.g. after RDS restart) rather than returning them to callers.
            conn.query('SELECT 1', (err: Error | null) => {
                done(err, conn);
            });
        },
    },
    migrations: {
        directory: [
            path.join(__dirname, './database/migrations'),
            ...(hasEnterpriseLicense
                ? [path.join(__dirname, './ee/database/migrations')]
                : []),
        ],
        tableName: 'knex_migrations',
        extension: 'ts',
        loadExtensions: ['.ts'],
    },
    seeds: {
        directory: [
            path.join(__dirname, './database/seeds/development'),
            ...(hasEnterpriseLicense
                ? [path.join(__dirname, './ee/database/seeds/development')]
                : []),
        ],
        loadExtensions: ['.ts'],
    },
};

const production: Knex.Config<Knex.PgConnectionConfig> = {
    ...development,
    migrations: {
        ...development.migrations,
        loadExtensions: ['.js'],
    },
    seeds: {
        ...development.seeds,
        loadExtensions: ['.js'],
    },
};

export default {
    development,
    production,
};
