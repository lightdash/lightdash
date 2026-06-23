import {
    AnyType,
    CreateRedshiftCredentials,
    RedshiftAuthenticationType,
    SupportedDbtAdapter,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import * as fs from 'fs';
import path from 'path';
import { PoolConfig } from 'pg';
import { PostgresClient, PostgresSqlBuilder } from './PostgresWarehouseClient';
import { mintRedshiftIamCredentials } from './redshiftIamCredentials';

// Refresh minted credentials this long before the AWS-reported expiry so an
// in-flight connection never races the expiry.
const CREDENTIALS_REFRESH_BUFFER_MS = 60 * 1000;
// Fallback lifetime when AWS returns no expiry — under the 15-min minimum.
const CREDENTIALS_FALLBACK_LIFETIME_MS = 14 * 60 * 1000;

const AMAZON_CA_BUNDLE = [
    fs.readFileSync(path.resolve(__dirname, './ca-bundle-aws-redshift.crt')),
];

const getSSLConfigFromMode = (mode: string): PoolConfig['ssl'] => {
    switch (mode) {
        case 'disable':
            return false;
        case 'no-verify':
            return {
                rejectUnauthorized: false,
            };
        case 'allow':
        case 'prefer':
        case 'require':
        case 'verify-ca':
            return {
                checkServerIdentity: () => undefined,
                ca: AMAZON_CA_BUNDLE,
            };
        case 'verify-full':
            return {
                ca: AMAZON_CA_BUNDLE,
            };
        default:
            throw new Error(`SSL mode "${mode}" not understood.`);
    }
};

export class RedshiftSqlBuilder extends PostgresSqlBuilder {
    type = WarehouseTypes.REDSHIFT;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.REDSHIFT;
    }
}

export class RedshiftWarehouseClient extends PostgresClient<CreateRedshiftCredentials> {
    private readonly ssl: PoolConfig['ssl'];

    private cachedIamPoolConfig:
        | { config: PoolConfig; expiresAt: number }
        | undefined;

    constructor(credentials: CreateRedshiftCredentials) {
        const sslmode = credentials.sslmode || 'prefer';
        const ssl = getSSLConfigFromMode(sslmode);

        const isIam =
            credentials.authenticationType === RedshiftAuthenticationType.IAM;

        // For password auth the connection string is fixed at construction.
        // For IAM auth credentials are minted lazily before each query (the
        // constructor is synchronous and minted credentials expire), so the
        // base config carries only the SSL settings until then.
        super(
            credentials,
            isIam
                ? { ssl }
                : {
                      connectionString:
                          RedshiftWarehouseClient.getConnectionString(
                              credentials,
                              credentials.user ?? '',
                              credentials.password ?? '',
                          ),
                      ssl,
                  },
        );
        this.ssl = ssl;
        // Override the sqlBuilder with RedshiftSqlBuilder
        this.sqlBuilder = new RedshiftSqlBuilder(credentials.startOfWeek);
    }

    private static getConnectionString(
        credentials: CreateRedshiftCredentials,
        user: string,
        password: string,
    ): string {
        return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(
            password,
        )}@${encodeURIComponent(credentials.host)}:${
            credentials.port
        }/${encodeURIComponent(credentials.dbname)}`;
    }

    // Every query path (test/runQuery/getCatalog/getAllTables/getFields)
    // funnels through streamQuery, so refreshing this.config here before
    // delegating to the base Postgres implementation covers them all without
    // touching the shared base class.
    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        if (
            this.credentials.authenticationType ===
            RedshiftAuthenticationType.IAM
        ) {
            this.config = await this.resolveIamPoolConfig();
        }
        return super.streamQuery(sql, streamCallback, options);
    }

    private async resolveIamPoolConfig(): Promise<PoolConfig> {
        const now = Date.now();
        if (
            this.cachedIamPoolConfig &&
            this.cachedIamPoolConfig.expiresAt > now
        ) {
            return this.cachedIamPoolConfig.config;
        }

        const { dbUser, dbPassword, expiration } =
            await mintRedshiftIamCredentials(this.credentials);

        const config: PoolConfig = {
            connectionString: RedshiftWarehouseClient.getConnectionString(
                this.credentials,
                dbUser,
                dbPassword,
            ),
            ssl: this.ssl,
        };

        const expiresAt = expiration
            ? expiration.getTime() - CREDENTIALS_REFRESH_BUFFER_MS
            : now + CREDENTIALS_FALLBACK_LIFETIME_MS;
        this.cachedIamPoolConfig = { config, expiresAt };

        return config;
    }
}
