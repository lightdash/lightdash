/**
 * Switch behaviour of database connector depending on environment
 */
import { readFileSync } from 'fs';
import { Knex } from 'knex';
import * as path from 'path';
import { parse } from 'pg-connection-string';
import * as tls from 'tls';
import { rootCertificates } from 'tls';
import { lightdashConfig } from './config/lightdashConfig';

const CONNECTION = lightdashConfig.database.connectionUri
    ? parse(lightdashConfig.database.connectionUri)
    : {};

// Mimics behaviour in https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/index.js
// and reuses the same logic as PostgresWarehouseClient
const getSSLConfigFromMode = (
    sslmode?: string | null,
): Knex.PgConnectionConfig['ssl'] => {
    const mode = sslmode || 'prefer';
    const ca = [
        ...rootCertificates,
        readFileSync(path.resolve(__dirname, './ca-bundle-aws-rds-global.pem')),
    ];
    switch (mode) {
        case 'disable':
            return false;
        case 'prefer':
        case 'require':
        case 'allow':
        case 'verify-ca':
        case 'verify-full':
            return {
                ca,
                checkServerIdentity: (hostname, cert) => {
                    if (hostname === 'localhost') {
                        // When connecting to localhost, we don't need to validate the server identity
                        // pg library defaults to localhost when connecting via IP address
                        return undefined;
                    }
                    return tls.checkServerIdentity(hostname, cert);
                },
            };
        case 'no-verify':
            return { rejectUnauthorized: false, ca };
        default:
            throw new Error(`Unknown sslmode for postgres: ${mode}`);
    }
};

export const DEFAULT_DB_MAX_CONNECTIONS = 10;

// Condition to be removed once we require Postgres vector extension
const hasEnterpriseLicense = !!lightdashConfig.license.licenseKey;

const development: Knex.Config<Knex.PgConnectionConfig> = {
    client: 'pg',
    connection: {
        ...CONNECTION,
        ssl: getSSLConfigFromMode(
            lightdashConfig.database.sslmode ||
                ((CONNECTION as any).ssl as string | undefined),
        ),
    },
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
