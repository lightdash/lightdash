import {
    assertUnreachable,
    getErrorMessage,
    getWarehouseGrantSuggestion,
    getWarehouseNetworkEndpoint,
    getWarehouseTestCapability,
    getWarehouseTestSchema,
    WarehouseAccessCheckKind,
    WarehouseConnectionFailureCause,
    WarehouseConnectionTestStage,
    WarehouseConnectionTestStageStatus,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseAccessCheck,
    type WarehouseClient,
    type WarehouseConnectionStagedTestResults,
    type WarehouseConnectionTestStageResult,
    type WarehouseNetworkEndpoint,
} from '@lightdash/common';
import net from 'node:net';
import tls from 'node:tls';
import { classifyWarehouseConnectionFailure } from '../connectionFailure/classifyWarehouseConnectionFailure';

export type ConnectionProbes = {
    tcp: (
        endpoint: WarehouseNetworkEndpoint,
        timeoutMs: number,
    ) => Promise<void>;
    tls: (
        endpoint: WarehouseNetworkEndpoint,
        timeoutMs: number,
    ) => Promise<void>;
};

const PROBE_TIMEOUT_MS = 10_000;

const timeoutError = (endpoint: WarehouseNetworkEndpoint) =>
    Object.assign(
        new Error(`Timed out connecting to ${endpoint.host}:${endpoint.port}`),
        { code: 'ETIMEDOUT' },
    );

export const nodeConnectionProbes: ConnectionProbes = {
    tcp: (endpoint, timeoutMs) =>
        new Promise((resolve, reject) => {
            const socket = net.connect({
                host: endpoint.host,
                port: endpoint.port,
            });
            socket.setTimeout(timeoutMs, () => {
                socket.destroy();
                reject(timeoutError(endpoint));
            });
            socket.once('connect', () => {
                socket.end();
                resolve();
            });
            socket.once('error', reject);
        }),
    tls: (endpoint, timeoutMs) =>
        new Promise((resolve, reject) => {
            const socket = tls.connect({
                host: endpoint.host,
                port: endpoint.port,
                servername: net.isIP(endpoint.host) ? undefined : endpoint.host,
            });
            socket.setTimeout(timeoutMs, () => {
                socket.destroy();
                reject(timeoutError(endpoint));
            });
            socket.once('secureConnect', () => {
                socket.end();
                resolve();
            });
            socket.once('error', reject);
        }),
};

type AccessQuery = {
    sql: string;
    parse: (rows: Record<string, unknown>[]) => WarehouseAccessCheck;
};

const toCount = (value: unknown): number => {
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
};

const toBoolean = (value: unknown): boolean =>
    value === true || value === 't' || value === 'true' || value === 1;

const countAccess = (
    schema: string,
    rows: Record<string, unknown>[],
): WarehouseAccessCheck => {
    const tableCount = toCount(rows[0]?.table_count);
    return {
        kind:
            tableCount > 0
                ? WarehouseAccessCheckKind.HAS_TABLES
                : WarehouseAccessCheckKind.EMPTY_OR_NOT_VISIBLE,
        schema,
        tableCount,
    };
};

export const getAccessCheckQuery = (
    credentials: CreateWarehouseCredentials,
    schema: string,
    escape: (value: string) => string,
): AccessQuery | null => {
    const literal = `'${escape(schema)}'`;
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return {
                sql: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = ${literal}) AS schema_exists, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = ${literal}) THEN has_schema_privilege(${literal}, 'USAGE') ELSE false END AS has_usage, (SELECT count(*) FROM information_schema.tables WHERE table_schema = ${literal}) AS table_count`,
                parse: (rows) => {
                    const row = rows[0] ?? {};
                    const tableCount = toCount(row.table_count);
                    if (!toBoolean(row.schema_exists)) {
                        return {
                            kind: WarehouseAccessCheckKind.DOES_NOT_EXIST,
                            schema,
                            tableCount: null,
                        };
                    }
                    if (!toBoolean(row.has_usage)) {
                        return {
                            kind: WarehouseAccessCheckKind.NO_USAGE,
                            schema,
                            tableCount: null,
                        };
                    }
                    return {
                        kind:
                            tableCount > 0
                                ? WarehouseAccessCheckKind.HAS_TABLES
                                : WarehouseAccessCheckKind.EMPTY,
                        schema,
                        tableCount,
                    };
                },
            };
        case WarehouseTypes.SNOWFLAKE:
            return {
                sql: `SELECT count(*) AS "table_count" FROM information_schema.tables WHERE table_schema ILIKE ${literal}`,
                parse: (rows) => countAccess(schema, rows),
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                sql: `SELECT count() AS table_count FROM system.tables WHERE database = ${literal}`,
                parse: (rows) => countAccess(schema, rows),
            };
        case WarehouseTypes.BIGQUERY:
            return {
                sql: `SELECT count(*) AS table_count FROM \`${escape(credentials.project)}.${escape(schema)}\`.INFORMATION_SCHEMA.TABLES`,
                parse: (rows) => countAccess(schema, rows),
            };
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return {
                sql: `SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = ${literal}`,
                parse: (rows) => countAccess(schema, rows),
            };
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const ACCESS_PASSES: Record<WarehouseAccessCheckKind, boolean> = {
    [WarehouseAccessCheckKind.HAS_TABLES]: true,
    [WarehouseAccessCheckKind.EMPTY]: false,
    [WarehouseAccessCheckKind.NO_USAGE]: false,
    [WarehouseAccessCheckKind.DOES_NOT_EXIST]: false,
    [WarehouseAccessCheckKind.EMPTY_OR_NOT_VISIBLE]: false,
};

const REDACTED = '[redacted]';
const URL_CREDENTIALS_PATTERN =
    /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

export const redactConnectionDetails = (
    message: string,
    secrets: string[],
): string =>
    secrets
        .filter((secret) => secret.length >= 4)
        .reduce(
            (redacted, secret) => redacted.split(secret).join(REDACTED),
            message,
        )
        .replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED}@`);

type RunArgs = {
    credentials: CreateWarehouseCredentials;
    connectThroughTunnel: boolean;
    createClient: () => Promise<
        Pick<WarehouseClient, 'test' | 'runQuery' | 'escapeString'>
    >;
    secrets: string[];
    probes?: ConnectionProbes;
};

type StageRun = {
    stage: WarehouseConnectionTestStage;
    run: () => Promise<WarehouseAccessCheck | null>;
};

const timed = async <T>(
    run: () => Promise<T>,
): Promise<{ value: T; durationMs: number }> => {
    const start = performance.now();
    const value = await run();
    return { value, durationMs: Math.round(performance.now() - start) };
};

const CAUSE_STAGES: Partial<
    Record<WarehouseConnectionFailureCause, WarehouseConnectionTestStage>
> = {
    [WarehouseConnectionFailureCause.NETWORK]:
        WarehouseConnectionTestStage.REACH_HOST,
    [WarehouseConnectionFailureCause.TIMEOUT]:
        WarehouseConnectionTestStage.REACH_HOST,
    [WarehouseConnectionFailureCause.TLS]: WarehouseConnectionTestStage.TLS,
};

export const attributeFailureToUncheckedStage = (
    stages: WarehouseConnectionTestStageResult[],
    failure: WarehouseConnectionStagedTestResults['failure'],
): Pick<WarehouseConnectionStagedTestResults, 'stages' | 'failure'> => {
    const causeStage = failure ? CAUSE_STAGES[failure.cause] : undefined;
    const causeIndex = stages.findIndex(({ stage }) => stage === causeStage);
    if (
        !failure ||
        causeIndex < 0 ||
        stages[causeIndex].status !==
            WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY
    ) {
        return { stages, failure };
    }
    return {
        stages: stages.map((result, index) => {
            if (index === causeIndex) {
                return {
                    ...result,
                    status: WarehouseConnectionTestStageStatus.FAILED,
                };
            }
            if (
                index > causeIndex &&
                result.status !== WarehouseConnectionTestStageStatus.PASSED
            ) {
                return {
                    ...result,
                    status: WarehouseConnectionTestStageStatus.NOT_RUN,
                    durationMs: null,
                };
            }
            return result;
        }),
        failure: { ...failure, stage: stages[causeIndex].stage },
    };
};

export const runStagedConnectionTest = async ({
    credentials,
    connectThroughTunnel,
    createClient,
    secrets,
    probes = nodeConnectionProbes,
}: RunArgs): Promise<WarehouseConnectionStagedTestResults> => {
    const capability = getWarehouseTestCapability(credentials);
    const endpoint = getWarehouseNetworkEndpoint(credentials);
    const schema = getWarehouseTestSchema(credentials);
    const canProbe = endpoint !== null && !connectThroughTunnel;
    let client: Awaited<ReturnType<RunArgs['createClient']>> | null = null;

    const stageRuns: (StageRun | WarehouseConnectionTestStage)[] = [
        capability.reachHost && canProbe
            ? {
                  stage: WarehouseConnectionTestStage.REACH_HOST,
                  run: async () => {
                      await probes.tcp(endpoint, PROBE_TIMEOUT_MS);
                      return null;
                  },
              }
            : WarehouseConnectionTestStage.REACH_HOST,
        capability.tls && canProbe
            ? {
                  stage: WarehouseConnectionTestStage.TLS,
                  run: async () => {
                      await probes.tls(endpoint, PROBE_TIMEOUT_MS);
                      return null;
                  },
              }
            : WarehouseConnectionTestStage.TLS,
        {
            stage: WarehouseConnectionTestStage.SIGN_IN,
            run: async () => {
                client = await createClient();
                await client.test();
                return null;
            },
        },
        schema !== null
            ? {
                  stage: WarehouseConnectionTestStage.CHECK_ACCESS,
                  run: async () => {
                      const signedIn = client;
                      if (!signedIn) return null;
                      const query = getAccessCheckQuery(
                          credentials,
                          schema,
                          (value) => signedIn.escapeString(value),
                      );
                      if (!query) return null;
                      const { rows } = await signedIn.runQuery(query.sql, {});
                      return query.parse(rows);
                  },
              }
            : WarehouseConnectionTestStage.CHECK_ACCESS,
    ];

    const stages: WarehouseConnectionTestStageResult[] = [];
    let failure: WarehouseConnectionStagedTestResults['failure'] = null;
    let access: WarehouseAccessCheck | null = null;

    for (const stageRun of stageRuns) {
        if (typeof stageRun === 'string') {
            stages.push({
                stage: stageRun,
                status: failure
                    ? WarehouseConnectionTestStageStatus.NOT_RUN
                    : WarehouseConnectionTestStageStatus.NOT_CHECKED_SEPARATELY,
                durationMs: null,
            });
        } else if (failure) {
            stages.push({
                stage: stageRun.stage,
                status: WarehouseConnectionTestStageStatus.NOT_RUN,
                durationMs: null,
            });
        } else {
            try {
                // eslint-disable-next-line no-await-in-loop
                const { value, durationMs } = await timed(stageRun.run);
                const passed = value === null || ACCESS_PASSES[value.kind];
                if (value) access = value;
                stages.push({
                    stage: stageRun.stage,
                    status: passed
                        ? WarehouseConnectionTestStageStatus.PASSED
                        : WarehouseConnectionTestStageStatus.FAILED,
                    durationMs,
                });
                if (!passed) {
                    failure = {
                        stage: stageRun.stage,
                        cause: WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
                        driverCode: null,
                        details: '',
                    };
                }
            } catch (error) {
                const classified = classifyWarehouseConnectionFailure(
                    credentials.type,
                    error,
                );
                stages.push({
                    stage: stageRun.stage,
                    status: WarehouseConnectionTestStageStatus.FAILED,
                    durationMs: null,
                });
                failure = {
                    stage: stageRun.stage,
                    cause:
                        stageRun.stage === WarehouseConnectionTestStage.TLS &&
                        classified.cause ===
                            WarehouseConnectionFailureCause.OTHER
                            ? WarehouseConnectionFailureCause.TLS
                            : classified.cause,
                    driverCode: classified.driverCode,
                    details: redactConnectionDetails(
                        getErrorMessage(error),
                        secrets,
                    ),
                };
            }
        }
    }

    const attributed = attributeFailureToUncheckedStage(stages, failure);

    const grantSuggestion =
        schema !== null &&
        failure?.cause ===
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT &&
        access?.kind !== WarehouseAccessCheckKind.DOES_NOT_EXIST
            ? getWarehouseGrantSuggestion(credentials, schema)
            : null;

    return {
        ok: failure === null,
        host: endpoint?.host ?? null,
        stages: attributed.stages,
        failure: attributed.failure,
        access,
        grantSuggestion,
    };
};
