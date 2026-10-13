import {
    DimensionType,
    FeatureFlags,
    FieldType,
    MissingConfigError,
    QueryExecutionContext,
    QueryHistoryStatus,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type DuckdbExecutionSpec,
    type PivotConfiguration,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';
import { existsSync } from 'node:fs';
import { Readable } from 'stream';
import type { Mock } from 'vitest';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { INatsClient } from '../../clients/NatsClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type SandboxSpec } from '../../ee/services/SandboxRuntime/types';
import Logger from '../../logging/logger';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { SqlQueryComposer } from '../../utils/QueryBuilder/SqlQueryComposer';
import { AiAccessService } from '../AiAccessService/AiAccessService';
import type { ICacheService } from '../CacheService/ICacheService';
import type { CacheHitCacheResult } from '../CacheService/types';
import {
    projectSummary,
    sessionAccount,
    user,
} from '../ProjectService/ProjectService.mock';
import { AsyncQueryService } from './AsyncQueryService';
import { DUCKDB_RUNNER_SOURCE } from './duckdb/duckdbSandboxHarness';
import { DuckdbSandboxRunner } from './duckdb/DuckdbSandboxRunner';
import { LocalProcessSandboxProvider } from './sandbox/LocalProcessSandboxProvider';

const { projectUuid, organizationUuid } = projectSummary;
const ordersUuid = '0b7c9c62-4b6e-4b1a-9c3e-4f6a0c8d2e11';
const customersUuid = '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a';

type Row = QueryHistory & {
    cacheKey: string;
    duckdbExecution: DuckdbExecutionSpec | null;
};

const toJsonl = (rows: Record<string, unknown>[]) =>
    Buffer.from(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

const parseJsonl = (bytes: Buffer | undefined) =>
    (bytes ?? Buffer.alloc(0))
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

const ordersColumns = {
    customer: { reference: 'customer', type: DimensionType.STRING },
    region: { reference: 'region', type: DimensionType.STRING },
    amount: { reference: 'amount', type: DimensionType.NUMBER },
} as unknown as ResultColumns;

const ordersRows = [
    { customer: 'ann', region: 'EMEA', amount: 10 },
    { customer: 'bob', region: 'AMER', amount: 5 },
    { customer: 'ann', region: 'AMER', amount: 7 },
];

const readyResult = (
    queryUuid: string,
    resultsFileName: string,
    extra: Partial<QueryHistory> = {},
): Row =>
    ({
        queryUuid,
        projectUuid,
        organizationUuid,
        createdByUserUuid: sessionAccount.user.id,
        context: QueryExecutionContext.AI,
        status: QueryHistoryStatus.READY,
        resultsFileName,
        resultsExpiresAt: null,
        totalRowCount: ordersRows.length,
        columns: ordersColumns,
        fields: {},
        requestParameters: {},
        cacheKey: `key-${queryUuid}`,
        duckdbExecution: null,
        ...extra,
    }) as unknown as Row;

/** Counts the sandboxes it creates, over real local processes. */
class RecordingProvider extends LocalProcessSandboxProvider {
    readonly created: string[] = [];

    /** Shared timeline: the provider records `create`, tests record their own events. */
    readonly events: string[] = [];

    readonly specs: SandboxSpec[] = [];

    async create(spec?: SandboxSpec) {
        this.events.push('create');
        if (spec) this.specs.push(spec);
        const handle = await super.create();
        this.created.push(handle.sandboxId);
        return handle;
    }
}

const RUNNING_STATUSES = [
    QueryHistoryStatus.PENDING,
    QueryHistoryStatus.QUEUED,
    QueryHistoryStatus.EXECUTING,
];

const fieldByUpdateKey: Record<string, keyof Row> = {
    status: 'status',
    error: 'error',
    cache_key: 'cacheKey',
    compiled_sql: 'compiledSql',
    fields: 'fields',
    columns: 'columns',
    original_columns: 'originalColumns',
    total_row_count: 'totalRowCount',
    results_file_name: 'resultsFileName',
    results_created_at: 'resultsCreatedAt',
    results_updated_at: 'resultsUpdatedAt',
    results_expires_at: 'resultsExpiresAt',
    pivot_values_columns: 'pivotValuesColumns',
    pivot_total_column_count: 'pivotTotalColumnCount',
    warehouse_execution_time_ms: 'warehouseExecutionTimeMs',
};

/**
 * DuckDB queries over stored results, with the database, object storage and
 * sandbox provider as the only fakes: the provider runs the real runner
 * script and real DuckDB in a local process.
 */
const buildHarness = ({
    flags = {},
    runnerSource,
    realReaderCheck = false,
}: {
    flags?: Partial<Record<FeatureFlags, boolean>>;
    runnerSource?: string;
    /** Authorizes references with the real AiAccessService instead of a pass-through. */
    realReaderCheck?: boolean;
} = {}) => {
    const files = new Map<string, Buffer>([
        ['orders-file', toJsonl(ordersRows)],
        [
            'customers-file',
            toJsonl([
                { customer: 'ann', tier: 'gold' },
                { customer: 'bob', tier: 'silver' },
            ]),
        ],
    ]);
    const rows = new Map<string, Row>([
        [ordersUuid, readyResult(ordersUuid, 'orders-file')],
        [
            customersUuid,
            readyResult(customersUuid, 'customers-file', {
                totalRowCount: 2,
                columns: {
                    customer: {
                        reference: 'customer',
                        type: DimensionType.STRING,
                    },
                    tier: { reference: 'tier', type: DimensionType.STRING },
                } as unknown as ResultColumns,
            }),
        ],
    ]);
    let created = 0;
    const setRow = (queryUuid: string, patch: Partial<Row>) => {
        rows.set(queryUuid, { ...rows.get(queryUuid)!, ...patch });
    };
    const queryHistoryModel = {
        create: vi.fn(
            async (
                _account: unknown,
                args: Parameters<QueryHistoryModel['create']>[1],
            ) => {
                created += 1;
                const queryUuid = `00000000-0000-4000-8000-${String(
                    created,
                ).padStart(12, '0')}`;
                rows.set(queryUuid, {
                    ...(args as unknown as Row),
                    queryUuid,
                    status: QueryHistoryStatus.PENDING,
                    createdAt: new Date(),
                    createdByUserUuid: sessionAccount.user.id,
                    createdByActorType: sessionAccount.authentication.type,
                    duckdbExecution: null,
                } as Row);
                return { queryUuid };
            },
        ),
        get: vi.fn(async (queryUuid: string) => rows.get(queryUuid)),
        getByQueryUuid: vi.fn(async (queryUuid: string) => rows.get(queryUuid)),
        pollForQueryCompletion: vi.fn(
            async ({ queryUuid }: { queryUuid: string }) => {
                const poll = async (): Promise<Row> => {
                    const row = rows.get(queryUuid);
                    if (row && RUNNING_STATUSES.includes(row.status)) {
                        await new Promise((resolve) => {
                            setTimeout(resolve, 10);
                        });
                        return poll();
                    }
                    if (row?.status !== QueryHistoryStatus.READY)
                        throw new Error(`query ${queryUuid} is ${row?.status}`);
                    return row;
                };
                return poll();
            },
        ),
        updateStatusToExecuting: vi.fn(async (queryUuid: string) => {
            const row = rows.get(queryUuid);
            if (row?.status !== QueryHistoryStatus.PENDING) return 0;
            setRow(queryUuid, { status: QueryHistoryStatus.EXECUTING });
            return 1;
        }),
        recordResultProducer: vi.fn(
            async (
                queryUuid: string,
                _projectUuid: string,
                _userUuid: string,
                resultProducer: QueryHistory['requestParameters']['resultProducer'],
            ) => {
                const row = rows.get(queryUuid)!;
                setRow(queryUuid, {
                    requestParameters: {
                        ...row.requestParameters,
                        resultProducer,
                    },
                });
            },
        ),
        recordAiSignInCredential: vi.fn(),
        setDuckdbExecution: vi.fn(
            async (queryUuid: string, spec: DuckdbExecutionSpec) => {
                setRow(queryUuid, { duckdbExecution: spec });
            },
        ),
        markDuckdbCacheHit: vi.fn(async (queryUuid: string) => {
            const spec = rows.get(queryUuid)!.duckdbExecution!;
            setRow(queryUuid, {
                duckdbExecution: { ...spec, cacheHit: true },
            });
        }),
        recordDuckdbRefusal: vi.fn(
            async (
                queryUuid: string,
                _projectUuid: string,
                refusal: DuckdbExecutionSpec['refusal'],
                error: string,
            ) => {
                const spec = rows.get(queryUuid)!.duckdbExecution!;
                setRow(queryUuid, {
                    status: QueryHistoryStatus.ERROR,
                    error,
                    duckdbExecution: { ...spec, refusal },
                });
            },
        ),
        update: vi.fn(
            async (
                queryUuid: string,
                _projectUuid: string,
                update: Record<string, unknown>,
            ) => {
                const patch: Partial<Row> = {};
                Object.entries(update).forEach(([key, value]) => {
                    const field = fieldByUpdateKey[key];
                    if (field && value !== undefined)
                        Object.assign(patch, { [field]: value });
                });
                setRow(queryUuid, patch);
            },
        ),
        updateStatusToError: vi.fn(
            async (queryUuid: string, _projectUuid: string, error: string) => {
                setRow(queryUuid, { status: QueryHistoryStatus.ERROR, error });
            },
        ),
        updateClaimedQueryToError: vi.fn(
            async (queryUuid: string, error: string) => {
                setRow(queryUuid, { status: QueryHistoryStatus.ERROR, error });
            },
        ),
    };
    const cacheService: ICacheService = {
        isResultsCacheEnabled: vi.fn(async () => true),
        findCachedResultsFile: vi.fn(
            async (
                _projectUuid: string,
                cacheKey: string,
            ): Promise<CacheHitCacheResult | null> => {
                const hit = [...rows.values()]
                    .filter(
                        (row) =>
                            row.cacheKey === cacheKey &&
                            row.status === QueryHistoryStatus.READY,
                    )
                    .at(-1);
                if (!hit?.resultsFileName) return null;
                return {
                    cacheHit: true,
                    queryUuid: hit.queryUuid,
                    resultProducer: null,
                    cacheKey,
                    fileName: hit.resultsFileName,
                    createdAt: hit.resultsCreatedAt!,
                    updatedAt: hit.resultsUpdatedAt!,
                    expiresAt: hit.resultsExpiresAt!,
                    totalRowCount: hit.totalRowCount ?? 0,
                    columns: hit.columns,
                    originalColumns: hit.originalColumns ?? null,
                    pivotValuesColumns: hit.pivotValuesColumns ?? null,
                    pivotTotalColumnCount: hit.pivotTotalColumnCount ?? null,
                };
            },
        ),
    };
    const resultsStorageClient = {
        isEnabled: true,
        configuration: { bucket: 'results' },
        getDownloadStream: vi.fn(async (fileName: string) => {
            const bytes = files.get(fileName) ?? files.get(`${fileName}.jsonl`);
            if (!bytes) throw new Error(`No results file ${fileName}`);
            return Readable.from([bytes]);
        }),
        createUploadStream: vi.fn((fileName: string) => {
            const chunks: Buffer[] = [];
            const append = (bytes: Buffer | string) => {
                chunks.push(Buffer.from(bytes));
            };
            return {
                write: vi.fn(async (written: Record<string, unknown>[]) => {
                    written.forEach((row) =>
                        append(`${JSON.stringify(row)}\n`),
                    );
                }),
                writeStream: { write: vi.fn(append) },
                close: vi.fn(async () => {
                    files.set(fileName, Buffer.concat(chunks));
                }),
            };
        }),
    };
    const natsClient: Record<keyof INatsClient, Mock> = {
        enqueueWarehouseQuery: vi.fn(),
        enqueuePreAggregateQuery: vi.fn(),
        enqueueMaterializationQuery: vi.fn(),
    };
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled:
                flags[featureFlagId as FeatureFlags] ??
                featureFlagId === FeatureFlags.ComposeSqlRunner,
        })),
    };
    const projectModel = {
        getSummary: vi.fn(async () => projectSummary),
        getEffectiveResultsCacheTtlSeconds: vi.fn(async () => 3600),
        getWarehouseCredentialsForBinding: vi.fn(async () => ({
            type: 'postgres',
        })),
    };
    const aiAccessService = realReaderCheck
        ? new AiAccessService({
              lightdashConfig: {
                  ...lightdashConfigMock,
                  ai: {
                      ...lightdashConfigMock.ai,
                      agentResultIdentityCheckEnabled: true,
                  },
              },
              analytics: analyticsMock,
              featureFlagModel,
              projectModel,
              queryHistoryModel: {
                  ...queryHistoryModel,
                  getDuckdbExecution: vi.fn(async () => null),
                  getManyWithDuckdbExecutions: vi.fn(async (uuids: string[]) =>
                      uuids.map((uuid) => ({
                          queryHistory: rows.get(uuid),
                          execution: null,
                      })),
                  ),
              },
          } as unknown as ConstructorParameters<typeof AiAccessService>[0])
        : {
              assertCanReadResultsForQueries: vi.fn(async () => new Map()),
          };
    const provider = new RecordingProvider();
    const runner = new DuckdbSandboxRunner({
        lightdashConfig: lightdashConfigMock,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        },
        provider,
        runnerSource: runnerSource ?? null,
    });
    const service = new AsyncQueryService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        queryHistoryModel,
        cacheService,
        resultsStorageClient,
        natsClient,
        projectModel,
        projectParametersModel: { find: vi.fn(async () => []) },
        userModel: { findSessionUserAndOrgByUuid: vi.fn(async () => user) },
        featureFlagModel,
        aiAccessService,
    } as unknown as ConstructorParameters<typeof AsyncQueryService>[0]);
    Object.assign(service, { duckdbSandboxRunner: runner });
    vi.spyOn(service, 'getUserAttributes').mockResolvedValue({
        userAttributes: {},
        intrinsicUserAttributes: {},
    });

    const waitForTerminal = async (queryUuid: string) => {
        await vi.waitFor(
            () => {
                expect([
                    QueryHistoryStatus.READY,
                    QueryHistoryStatus.ERROR,
                ]).toContain(rows.get(queryUuid)?.status);
            },
            { timeout: 20_000, interval: 25 },
        );
        return rows.get(queryUuid)!;
    };

    const composeSql = async (
        args: Partial<
            Parameters<AsyncQueryService['executeAsyncComposeSqlQuery']>[0]
        > = {},
    ) => {
        const { queryUuid } = await service.executeAsyncComposeSqlQuery({
            account: sessionAccount,
            projectUuid,
            context: QueryExecutionContext.AI,
            sql: 'SELECT customer, SUM(amount) AS total FROM orders GROUP BY customer ORDER BY customer',
            references: { orders: ordersUuid },
            ...args,
        });
        return waitForTerminal(queryUuid);
    };

    /** A merge-like node: two results joined with compile-time columns and a row-cap guard. */
    const joinOrdersToCustomers = async ({
        sourceRowCap = 100,
    }: { sourceRowCap?: number } = {}) => {
        const sql =
            'SELECT o.customer, c.tier, SUM(o.amount) AS total FROM orders o JOIN customers c ON o.customer = c.customer GROUP BY 1, 2 ORDER BY 1';
        const { queryUuid } = await service.executeAsyncDuckdbSourceQuery({
            account: sessionAccount,
            projectUuid,
            context: QueryExecutionContext.AI,
            sql,
            references: { orders: ordersUuid, customers: customersUuid },
            plan: {
                columns: {
                    mode: 'supplied',
                    compose: ({ warehouseClient, pivotConfiguration }) =>
                        new SqlQueryComposer({
                            userSql: sql,
                            columns: [
                                {
                                    name: 'customer',
                                    type: DimensionType.STRING,
                                },
                                { name: 'tier', type: DimensionType.STRING },
                                { name: 'total', type: DimensionType.NUMBER },
                            ],
                            warehouseClient,
                            pivotConfiguration,
                            limit: 10,
                            parameters: {},
                            dashboardFilters: undefined,
                            tileUuid: undefined,
                            dashboardSorts: undefined,
                        }),
                    originalColumns: {},
                    requestParameters: {
                        sql,
                        context: QueryExecutionContext.AI,
                    } as never,
                },
                guard: {
                    legLabelByReferenceTable: { orders: 'Orders' },
                    sourceRowCap,
                },
                referenceLabels: { orders: 'Orders', customers: 'Customers' },
            },
        });
        return waitForTerminal(queryUuid);
    };

    const runWithoutReferences = async (sql: string) => {
        const { queryUuid } = await service.executeAsyncDuckdbSourceQuery({
            account: sessionAccount,
            projectUuid,
            context: QueryExecutionContext.CALCULATE_TOTAL,
            sql,
            references: {},
            plan: {
                columns: { mode: 'discover' },
                guard: null,
                referenceLabels: {},
            },
        });
        return waitForTerminal(queryUuid);
    };

    const resultRows = (row: Row) =>
        parseJsonl(
            files.get(row.resultsFileName!) ??
                files.get(`${row.resultsFileName}.jsonl`),
        );

    return {
        service,
        aiAccessService,
        rows,
        files,
        provider,
        runner,
        natsClient,
        composeSql,
        joinOrdersToCustomers,
        runWithoutReferences,
        waitForTerminal,
        resultRows,
    };
};

describe('DuckDB queries over results run in a one-shot sandbox', () => {
    test('a SQL transformation discovers its columns and lands its rows', async () => {
        const { composeSql, resultRows, provider } = buildHarness();

        const row = await composeSql();

        expect(row.error ?? null).toBeNull();
        expect(row.status).toBe(QueryHistoryStatus.READY);
        expect(resultRows(row)).toEqual([
            { customer: 'ann', total: 17 },
            { customer: 'bob', total: 5 },
        ]);
        expect(row.totalRowCount).toBe(2);
        expect(row.columns).toEqual({
            customer: expect.objectContaining({
                reference: 'customer',
                type: DimensionType.STRING,
            }),
            total: expect.objectContaining({
                reference: 'total',
                type: DimensionType.NUMBER,
            }),
        });
        expect(provider.created).toHaveLength(1);
    }, 30_000);

    test('a pivoted transformation spreads its values into one column per group', async () => {
        const { composeSql, resultRows } = buildHarness();
        const pivotConfiguration: PivotConfiguration = {
            indexColumn: { reference: 'customer', type: VizIndexType.CATEGORY },
            valuesColumns: [
                {
                    reference: 'amount',
                    aggregation: VizAggregationOptions.SUM,
                },
            ],
            groupByColumns: [{ reference: 'region' }],
            sortBy: [{ reference: 'customer', direction: SortByDirection.ASC }],
        };

        const row = await composeSql({
            sql: 'SELECT customer, region, amount FROM orders',
            pivotConfiguration,
        });

        expect(row.error ?? null).toBeNull();
        expect(resultRows(row)).toEqual([
            { customer: 'ann', amount_sum_AMER: 7, amount_sum_EMEA: 10 },
            { customer: 'bob', amount_sum_AMER: 5 },
        ]);
        expect(row.totalRowCount).toBe(2);
        expect(row.pivotTotalColumnCount).toBe(2);
        expect(row.pivotValuesColumns).toEqual({
            amount_sum_AMER: {
                referenceField: 'amount',
                pivotColumnName: 'amount_sum_AMER',
                aggregation: VizAggregationOptions.SUM,
                pivotValues: [
                    {
                        referenceField: 'region',
                        value: 'AMER',
                        formatted: 'AMER',
                    },
                ],
                // DuckDB serialises BIGINT as a string, on the worker too
                columnIndex: '1',
            },
            amount_sum_EMEA: {
                referenceField: 'amount',
                pivotColumnName: 'amount_sum_EMEA',
                aggregation: VizAggregationOptions.SUM,
                pivotValues: [
                    {
                        referenceField: 'region',
                        value: 'EMEA',
                        formatted: 'EMEA',
                    },
                ],
                columnIndex: '2',
            },
        });
        expect(Object.keys(row.columns ?? {})).toEqual([
            'customer',
            'amount_sum_AMER',
            'amount_sum_EMEA',
        ]);
        expect(Object.keys(row.originalColumns ?? {})).toEqual([
            'customer',
            'region',
            'amount',
        ]);
    }, 30_000);

    test('a pivot over a column the SQL does not return errors the query', async () => {
        const { composeSql } = buildHarness();

        const row = await composeSql({
            sql: 'SELECT customer, amount FROM orders',
            pivotConfiguration: {
                indexColumn: {
                    reference: 'customer',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'region' }],
                sortBy: undefined,
            },
        });

        expect(row.status).toBe(QueryHistoryStatus.ERROR);
        expect(row.error).toMatch(/region/);
    }, 30_000);

    test('a planned join runs its composed statement without probing', async () => {
        const { joinOrdersToCustomers, resultRows, provider } = buildHarness();

        const row = await joinOrdersToCustomers();

        expect(row.error ?? null).toBeNull();
        expect(resultRows(row)).toEqual([
            { customer: 'ann', tier: 'gold', total: 17 },
            { customer: 'bob', tier: 'silver', total: 5 },
        ]);
        expect(row.duckdbExecution).toMatchObject({
            references: { orders: ordersUuid, customers: customersUuid },
            cacheHit: false,
            refusal: null,
        });
        expect(provider.created).toHaveLength(1);
    }, 30_000);

    test('a referenced result with no rows is read as its fields, so a join still binds', async () => {
        const { joinOrdersToCustomers, files, rows, resultRows } =
            buildHarness();
        files.set('orders-file', Buffer.alloc(0));
        rows.set(
            ordersUuid,
            readyResult(ordersUuid, 'orders-file', {
                totalRowCount: 0,
                columns: {},
                fields: {
                    customer: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'customer',
                        label: 'Customer',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '',
                        hidden: false,
                    },
                    amount: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.NUMBER,
                        name: 'amount',
                        label: 'Amount',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '',
                        hidden: false,
                    },
                } as unknown as QueryHistory['fields'],
            }),
        );

        const row = await joinOrdersToCustomers();

        expect(row.error ?? null).toBeNull();
        expect(row.status).toBe(QueryHistoryStatus.READY);
        expect(resultRows(row)).toEqual([]);
    }, 30_000);

    test('a reference that failed is named by its label in the error', async () => {
        const { joinOrdersToCustomers, rows, provider } = buildHarness();
        rows.set(
            ordersUuid,
            readyResult(ordersUuid, 'orders-file', {
                status: QueryHistoryStatus.ERROR,
            }),
        );

        const row = await joinOrdersToCustomers();

        expect(row.status).toBe(QueryHistoryStatus.ERROR);
        expect(row.error).toMatch(/^Orders did not complete: /);
        expect(provider.created).toHaveLength(0);
    }, 30_000);

    test('a guard refusal is recorded before any sandbox exists', async () => {
        const { joinOrdersToCustomers, provider } = buildHarness();

        const row = await joinOrdersToCustomers({ sourceRowCap: 3 });

        expect(row.status).toBe(QueryHistoryStatus.ERROR);
        expect(row.error).toBe(
            'Orders returned the maximum of 3 rows, so the merged results would be missing data. Add a filter to Orders, then merge again.',
        );
        expect(row.duckdbExecution?.refusal).toEqual({ kind: 'row_cap' });
        expect(provider.created).toHaveLength(0);
    }, 30_000);

    test('a totals node without references runs over no inputs', async () => {
        const { runWithoutReferences, resultRows } = buildHarness();

        const row = await runWithoutReferences('SELECT 42 AS total');

        expect(row.error ?? null).toBeNull();
        expect(resultRows(row)).toEqual([{ total: 42 }]);
        expect(row.requestParameters.resultProducer).toMatchObject({
            credentialOwner: { kind: 'no_warehouse_data' },
            warehouseConnectionUuid: null,
        });
    }, 30_000);

    test('a transformation is stamped as derived at submit', async () => {
        const { composeSql } = buildHarness({
            flags: { [FeatureFlags.AgentIdentity]: true },
        });

        const row = await composeSql();

        expect(row.error ?? null).toBeNull();
        expect(row.requestParameters.resultProducer).toMatchObject({
            version: 1,
            credentialOwner: { kind: 'derived' },
            warehouseConnectionUuid: null,
            authMethod: sessionAccount.authentication.type,
            entitlementFingerprint: expect.any(String),
        });
    }, 30_000);

    test('a derived row without a producer is refused by the reader check', async () => {
        const { service, aiAccessService, rows, provider } = buildHarness({
            flags: { [FeatureFlags.AgentIdentity]: true },
            realReaderCheck: true,
        });
        const lineageWarning = vi.spyOn(
            (aiAccessService as unknown as { logger: typeof Logger }).logger,
            'warn',
        );
        const derivedUuid = '5f4e3d2c-1b0a-4987-8654-3210fedcba98';
        rows.set(
            derivedUuid,
            readyResult(derivedUuid, 'orders-file', {
                requestParameters: {
                    sql: 'SELECT * FROM orders',
                    references: {},
                } as unknown as QueryHistory['requestParameters'],
            }),
        );
        const rowsBefore = rows.size;

        await expect(
            service.executeAsyncComposeSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.AI,
                sql: 'SELECT * FROM derived',
                references: { derived: derivedUuid },
            }),
        ).rejects.toThrow(
            'These results are not compatible with your current access. Run the query again.',
        );
        expect(lineageWarning).toHaveBeenCalledWith(
            'Agent result lineage refused',
            expect.objectContaining({
                refusedNode: derivedUuid,
                reason: 'missing_producer',
            }),
        );
        expect(rows.size).toBe(rowsBefore);
        expect(provider.created).toHaveLength(0);
    }, 30_000);

    test('without a sandbox provider the submission fails naming the missing configuration', async () => {
        const { service, rows } = buildHarness();
        Object.assign(service, { duckdbSandboxRunner: null });
        const rowsBefore = rows.size;

        await expect(
            service.executeAsyncComposeSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.AI,
                sql: 'SELECT * FROM orders',
                references: { orders: ordersUuid },
            }),
        ).rejects.toThrow(MissingConfigError);
        await expect(
            service.executeAsyncComposeSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.AI,
                sql: 'SELECT * FROM orders',
                references: { orders: ordersUuid },
            }),
        ).rejects.toThrow(/E2B_API_KEY/);
        expect(rows.size).toBe(rowsBefore);
    });

    test('a DuckDB query never touches the worker queue', async () => {
        const { composeSql, joinOrdersToCustomers, natsClient } =
            buildHarness();

        await composeSql();
        await joinOrdersToCustomers();

        Object.values(natsClient).forEach((enqueue) =>
            expect(enqueue).not.toHaveBeenCalled(),
        );
    }, 30_000);

    describe('sandbox failures land on the row', () => {
        test('a SQL error carries the DuckDB message', async () => {
            const { composeSql } = buildHarness();

            const row = await composeSql({
                sql: 'SELECT no_such_column FROM orders',
            });

            expect(row.status).toBe(QueryHistoryStatus.ERROR);
            expect(row.error).toMatch(/no_such_column/);
        }, 30_000);

        test('a run over the timeout says so', async () => {
            const { composeSql, runner } = buildHarness();
            const create = runner.create.bind(runner);
            vi.spyOn(runner, 'create').mockImplementation((args) =>
                create({ ...args, commandTimeoutMs: 1000 }),
            );

            const row = await composeSql({
                sql: 'SELECT count(*) AS n FROM range(100000000) a, range(100000000) b',
            });

            expect(row.status).toBe(QueryHistoryStatus.ERROR);
            expect(row.error).toBe('SQL transformation exceeded 1s');
        }, 30_000);

        test('a result over the output cap is refused', async () => {
            const { composeSql } = buildHarness();

            const row = await composeSql({
                sql: "SELECT repeat('x', 1000000) AS padding FROM range(70)",
            });

            expect(row.status).toBe(QueryHistoryStatus.ERROR);
            expect(row.error).toBe(
                'SQL transformation result exceeds the 64 MiB limit',
            );
        }, 60_000);
    });

    describe('the sandbox cold start overlaps waiting for references', () => {
        const startWithOrdersRunning = (
            rows: Map<string, Row>,
            provider: RecordingProvider,
        ) => {
            const createdBefore = provider.created.length;
            rows.set(
                ordersUuid,
                readyResult(ordersUuid, 'orders-file', {
                    status: QueryHistoryStatus.EXECUTING,
                }),
            );
            return async () => {
                await vi.waitFor(
                    () =>
                        expect(provider.created.length).toBeGreaterThan(
                            createdBefore,
                        ),
                    { timeout: 10_000, interval: 10 },
                );
                provider.events.push('reference ready');
                rows.set(ordersUuid, readyResult(ordersUuid, 'orders-file'));
            };
        };

        test('a reference still running gets its sandbox created before it finishes', async () => {
            const { composeSql, rows, provider, resultRows } = buildHarness();
            const finishOrders = startWithOrdersRunning(rows, provider);

            const pending = composeSql();
            await finishOrders();
            const row = await pending;

            expect(row.error ?? null).toBeNull();
            expect(resultRows(row)).toEqual([
                { customer: 'ann', total: 17 },
                { customer: 'bob', total: 5 },
            ]);
            expect(provider.events).toEqual(['create', 'reference ready']);
            expect(existsSync(provider.created[0])).toBe(false);
        }, 30_000);

        test('a sandbox created while waiting is destroyed when the cache serves the query', async () => {
            const { composeSql, rows, provider } = buildHarness();
            await composeSql();
            provider.events.splice(0);
            const finishOrders = startWithOrdersRunning(rows, provider);

            const pending = composeSql();
            await finishOrders();
            const row = await pending;

            expect(row.duckdbExecution?.cacheHit).toBe(true);
            expect(provider.events).toEqual(['create', 'reference ready']);
            expect(provider.created).toHaveLength(2);
            expect(existsSync(provider.created[1])).toBe(false);
        }, 30_000);

        test('a sandbox created while waiting is destroyed when the guard refuses', async () => {
            const { joinOrdersToCustomers, rows, provider } = buildHarness();
            const finishOrders = startWithOrdersRunning(rows, provider);

            const pending = joinOrdersToCustomers({ sourceRowCap: 3 });
            await finishOrders();
            const row = await pending;

            expect(row.duckdbExecution?.refusal).toEqual({ kind: 'row_cap' });
            expect(provider.created).toHaveLength(1);
            expect(existsSync(provider.created[0])).toBe(false);
        }, 30_000);

        test('a sandbox created while waiting lives through the whole reference wait, the probe and the run', async () => {
            const { composeSql, rows, provider } = buildHarness();
            const finishOrders = startWithOrdersRunning(rows, provider);

            const pending = composeSql();
            await finishOrders();
            await pending;

            const referenceWaitMs = 15 * 60_000;
            const commandMs = 5 * 60_000;
            expect(provider.specs).toHaveLength(1);
            expect(provider.specs[0].timeoutMs).toBeGreaterThanOrEqual(
                referenceWaitMs + 2 * commandMs,
            );
        }, 30_000);

        test('a sandbox created over ready references budgets the probe, the run and transfer, but no wait', async () => {
            const waiting = buildHarness();
            const finishOrders = startWithOrdersRunning(
                waiting.rows,
                waiting.provider,
            );
            const pending = waiting.composeSql();
            await finishOrders();
            await pending;

            const { composeSql, provider } = buildHarness();
            await composeSql();

            const commandMs = 5 * 60_000;
            expect(provider.specs).toHaveLength(1);
            expect(provider.specs[0].timeoutMs).toBeGreaterThan(2 * commandMs);
            expect(provider.specs[0].timeoutMs).toBeLessThan(
                waiting.provider.specs[0].timeoutMs,
            );
        }, 30_000);

        test('references already ready are looked up in the cache before any sandbox is created', async () => {
            const { composeSql, provider } = buildHarness();
            await composeSql();
            provider.events.splice(0);

            const row = await composeSql();

            expect(row.duckdbExecution?.cacheHit).toBe(true);
            expect(provider.events).toEqual([]);
        }, 30_000);
    });

    describe('the results cache', () => {
        test('the same SQL over the same result files is served without a sandbox', async () => {
            const { composeSql, provider, resultRows } = buildHarness();

            const first = await composeSql();
            const second = await composeSql();

            expect(provider.created).toHaveLength(1);
            expect(second).toMatchObject({
                status: QueryHistoryStatus.READY,
                resultsFileName: first.resultsFileName,
                totalRowCount: 2,
                columns: first.columns,
            });
            expect(second.duckdbExecution?.cacheHit).toBe(true);
            expect(resultRows(second)).toEqual(resultRows(first));
        }, 30_000);

        test('a new runner version runs the sandbox again', async () => {
            const { service, composeSql, provider } = buildHarness();

            await composeSql();
            Object.assign(service, {
                duckdbSandboxRunner: new DuckdbSandboxRunner({
                    lightdashConfig: lightdashConfigMock,
                    logger: {
                        info: vi.fn(),
                        warn: vi.fn(),
                        debug: vi.fn(),
                        error: vi.fn(),
                    },
                    provider,
                    runnerSource: `${DUCKDB_RUNNER_SOURCE}\n// next version\n`,
                }),
            });
            const second = await composeSql();

            expect(provider.created).toHaveLength(2);
            expect(second.duckdbExecution?.cacheHit).toBe(false);
        }, 30_000);

        test('is bypassed when agent identity is on', async () => {
            const { composeSql, provider } = buildHarness({
                flags: { [FeatureFlags.AgentIdentity]: true },
            });

            await composeSql();
            await composeSql();

            expect(provider.created).toHaveLength(2);
        }, 30_000);

        test('is bypassed for agent queries when the AI skip results cache flag is on', async () => {
            const { composeSql, provider } = buildHarness({
                flags: { [FeatureFlags.AiAccessSkipResultsCache]: true },
            });

            await composeSql();
            await composeSql();

            expect(provider.created).toHaveLength(2);
        }, 30_000);

        test('is bypassed for agent queries over results produced with agent credentials', async () => {
            const { composeSql, provider, rows } = buildHarness();
            rows.set(
                ordersUuid,
                readyResult(ordersUuid, 'orders-file', {
                    requestParameters: {
                        aiSignInCredentialUuid: 'credential-uuid',
                    } as unknown as QueryHistory['requestParameters'],
                }),
            );

            await composeSql();
            await composeSql();

            expect(provider.created).toHaveLength(2);
        }, 30_000);

        test('the AI skip flag does not apply outside agent queries', async () => {
            const { composeSql, provider } = buildHarness({
                flags: { [FeatureFlags.AiAccessSkipResultsCache]: true },
            });

            await composeSql({ context: QueryExecutionContext.SQL_RUNNER });
            await composeSql({ context: QueryExecutionContext.SQL_RUNNER });

            expect(provider.created).toHaveLength(1);
        }, 30_000);
    });
});
