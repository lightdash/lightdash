import {
    AI_AGENT_APPLICATION_NAME,
    AI_AGENT_SESSION_SETTING,
    CreateRedshiftCredentials,
    getErrorMessage,
    getWarehouseTableType,
    RedshiftAuthenticationType,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import * as fs from 'fs';
import path from 'path';
import * as pg from 'pg';
import { PoolClient, PoolConfig } from 'pg';
import {
    PostgresClient,
    PostgresSqlBuilder,
    type PostgresQueryAttempt,
    type PostgresStreamQueryOptions,
} from './PostgresWarehouseClient';
import { mintRedshiftIamCredentials } from './redshiftIamCredentials';

// Refresh minted credentials this long before the AWS-reported expiry so an
// in-flight connection never races the expiry.
const CREDENTIALS_REFRESH_BUFFER_MS = 60 * 1000;
// Fallback lifetime when AWS returns no expiry — under the 15-min minimum.
const CREDENTIALS_FALLBACK_LIFETIME_MS = 14 * 60 * 1000;

// Tile queries on a healthy workgroup return a first row well within this.
const STALL_CHECK_DELAY_MS = 30 * 1000;
const MAX_STALL_RETRIES = 2;
const STALL_LOOKUP_TIMEOUT_MS = 15 * 1000;

// The lookup must see its own running query, otherwise an empty result for
// the stalled session proves nothing and we keep waiting.
const STALL_LOOKUP_SQL = `
    SELECT
        (SELECT COUNT(*) FROM sys_query_history
            WHERE session_id = pg_backend_pid()
                AND TRIM(status) = 'running') AS own_running,
        (SELECT COUNT(*) FROM sys_query_history
            WHERE session_id = $1
                AND start_time > DATEADD(minute, -15, GETDATE())
                AND (TRIM(status) IN ('planning', 'queued', 'running', 'returning')
                    OR TRIM(query_type) NOT IN ('UTILITY', 'COMMAND'))) AS stalled_session_records
`;

type StallVerdict =
    | { stalled: true; reason: 'session_setup' | 'no_query_record' }
    | {
          stalled: false;
          reason:
              | 'not_connected'
              | 'query_recorded'
              | 'lookup_not_visible'
              | 'lookup_failed';
      };

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

export type RedshiftLogger = {
    info: (message: string, metadata?: Record<string, unknown>) => void;
    warn?: (message: string, metadata?: Record<string, unknown>) => void;
};

export class RedshiftSqlBuilder extends PostgresSqlBuilder {
    type = WarehouseTypes.REDSHIFT;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.REDSHIFT;
    }
}

export class RedshiftWarehouseClient extends PostgresClient<CreateRedshiftCredentials> {
    private readonly ssl: PoolConfig['ssl'];

    private readonly agentJobControls: boolean;

    private readonly logger: Required<RedshiftLogger>;

    private cachedIamPoolConfig:
        | { config: PoolConfig; expiresAt: number }
        | undefined;

    constructor(
        credentials: CreateRedshiftCredentials,
        options?: {
            agentSession?: boolean;
            agentJobControls?: boolean;
            logger?: RedshiftLogger;
        },
    ) {
        const sslmode = credentials.sslmode || 'prefer';
        const ssl = getSSLConfigFromMode(sslmode);

        const isIam =
            credentials.authenticationType === RedshiftAuthenticationType.IAM ||
            credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER;

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
            options,
        );
        this.ssl = ssl;
        this.agentJobControls = options?.agentJobControls ?? false;
        const logger = options?.logger;
        this.logger = logger
            ? {
                  info: logger.info.bind(logger),
                  warn: (logger.warn ?? logger.info).bind(logger),
              }
            : console;
        // Override the sqlBuilder with RedshiftSqlBuilder
        this.sqlBuilder = new RedshiftSqlBuilder(credentials.startOfWeek);
    }

    protected async prepareSession(client: PoolClient): Promise<void> {
        if (this.agentJobControls) {
            await client.query('SET enable_result_cache_for_session TO off');
        }
    }

    protected getAgentSessionStatement(): string {
        return `SELECT set_config('${AI_AGENT_SESSION_SETTING}', 'true', false)`;
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
        options: PostgresStreamQueryOptions,
    ): Promise<void> {
        if (
            this.credentials.authenticationType ===
                RedshiftAuthenticationType.IAM ||
            this.credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER
        ) {
            this.config = await this.resolveIamPoolConfig();
        }
        if (!options.recoverStalledQuery) {
            return super.streamQuery(sql, streamCallback, options);
        }
        return this.streamQueryRecoveringStalls(sql, streamCallback, options);
    }

    // A stalled attempt has streamed no rows, so retrying with the same
    // callback is safe. The last attempt runs unwatched, leaving the
    // statement timeout as the final backstop.
    private async streamQueryRecoveringStalls(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: PostgresStreamQueryOptions,
    ): Promise<void> {
        const queryUuid = options.tags?.query_uuid ?? null;
        const startedAt = Date.now();
        for (let retry = 0; retry < MAX_STALL_RETRIES; retry += 1) {
            const stallError = new WarehouseQueryError(
                'Warehouse query stalled before reaching the warehouse',
            );
            let attempt: PostgresQueryAttempt | undefined;
            let settled = false;
            const stallCheck = setTimeout(() => {
                if (!attempt || attempt.hasReceivedRow()) return;
                const watched = attempt;
                const lookupStart = Date.now();
                void this.getStallVerdict(watched).then((verdict) => {
                    if (settled) return;
                    const metadata = {
                        queryUuid,
                        pid: watched.getBackendPid(),
                        reason: verdict.reason,
                        retry,
                        maxRetries: MAX_STALL_RETRIES,
                        stallCheckDelayMs: STALL_CHECK_DELAY_MS,
                        lookupMs: Date.now() - lookupStart,
                        elapsedMs: Date.now() - startedAt,
                    };
                    if (verdict.stalled && watched.abort(stallError)) {
                        this.logger.warn(
                            'Redshift query stalled with no first row, retrying on a new connection',
                            metadata,
                        );
                    } else {
                        this.logger.info(
                            'Redshift query has no first row yet, still waiting',
                            metadata,
                        );
                    }
                });
            }, STALL_CHECK_DELAY_MS);
            try {
                // eslint-disable-next-line no-await-in-loop
                await this.streamQueryAttempt(
                    sql,
                    streamCallback,
                    options,
                    (started) => {
                        attempt = started;
                    },
                );
                if (retry > 0) {
                    this.logger.info(
                        'Redshift query recovered after stall retry',
                        {
                            queryUuid,
                            retry,
                            elapsedMs: Date.now() - startedAt,
                        },
                    );
                }
                return;
            } catch (error) {
                if (error !== stallError) throw error;
            } finally {
                settled = true;
                clearTimeout(stallCheck);
            }
        }
        this.logger.warn(
            'Redshift query stalled on every retry, running the final attempt unwatched',
            {
                queryUuid,
                retries: MAX_STALL_RETRIES,
                elapsedMs: Date.now() - startedAt,
            },
        );
        await this.streamQueryAttempt(sql, streamCallback, options, null);
    }

    private async getStallVerdict(
        attempt: PostgresQueryAttempt,
    ): Promise<StallVerdict> {
        const pid = attempt.getBackendPid();
        if (pid === null) return { stalled: false, reason: 'not_connected' };
        // Still on the session SETs, so the real query was never sent
        if (!attempt.hasSentQuery()) {
            return { stalled: true, reason: 'session_setup' };
        }

        let client: pg.Client | undefined;
        try {
            // Same user as the stalled query: non-superusers only see their own history
            client = new pg.Client({
                ...this.config,
                connectionTimeoutMillis: STALL_LOOKUP_TIMEOUT_MS,
                query_timeout: STALL_LOOKUP_TIMEOUT_MS,
            });
            client.on('error', (error) => {
                this.logger.warn('Redshift stall lookup connection error', {
                    pid,
                    error: getErrorMessage(error),
                });
            });
            await client.connect();
            const { rows } = await client.query<{
                own_running: number | bigint;
                stalled_session_records: number | bigint;
            }>(STALL_LOOKUP_SQL, [pid]);
            if (!rows[0] || Number(rows[0].own_running) === 0) {
                return { stalled: false, reason: 'lookup_not_visible' };
            }
            return Number(rows[0].stalled_session_records) === 0
                ? { stalled: true, reason: 'no_query_record' }
                : { stalled: false, reason: 'query_recorded' };
        } catch (error) {
            this.logger.warn('Redshift stall lookup failed', {
                pid,
                error: getErrorMessage(error),
            });
            return { stalled: false, reason: 'lookup_failed' };
        } finally {
            await client?.end().catch(() => undefined);
        }
    }

    // SVV_ALL_* are grant-filtered catalog views; SVV_TABLES and SVV_COLUMNS are
    // visible to all users unless metadata_security is on. Keep SVV_COLUMNS for
    // late-binding view columns, gated on SVV_ALL_TABLES. Plain Postgres keeps its catalog.
    async getAllTables() {
        if (!(await this.isRedshift())) return super.getAllTables();
        const query = `
            SELECT database_name, schema_name, table_name, table_type
            FROM svv_all_tables
            WHERE database_name = $1
                AND schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_internal')
            ORDER BY 1, 2, 3
        `;
        const { rows } = await this.runQuery(query, {}, undefined, [
            this.credentials.dbname,
        ]);
        return rows.map((row) => ({
            database: row.database_name,
            schema: row.schema_name,
            table: row.table_name,
            tableType: getWarehouseTableType(row.table_type),
        }));
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        if (!(await this.isRedshift())) {
            return super.getFields(tableName, schema, database, tags);
        }
        const { values, schemaParam, databaseParam } = this.bindFieldsFilters(
            tableName,
            schema,
            database,
        );
        const query = `
            SELECT c.table_catalog,
                   c.table_schema,
                   c.table_name,
                   c.column_name,
                   c.data_type
            FROM svv_columns c
            JOIN svv_all_tables t
                ON t.database_name = c.table_catalog
                AND t.schema_name = c.table_schema
                AND t.table_name = c.table_name
            WHERE c.table_name = $1
            ${schemaParam ? `AND c.table_schema = ${schemaParam}` : ''}
            ${databaseParam ? `AND c.table_catalog = ${databaseParam}` : ''}
            ORDER BY c.ordinal_position
        `;
        const { rows } = await this.runQuery(query, tags, undefined, values);
        return this.parsePostgresCatalog(rows);
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
            ...(this.agentSession
                ? { application_name: AI_AGENT_APPLICATION_NAME }
                : {}),
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
