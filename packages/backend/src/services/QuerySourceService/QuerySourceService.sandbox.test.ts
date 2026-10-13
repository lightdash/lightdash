import {
    DimensionType,
    FeatureFlags,
    MissingConfigError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type DuckdbExecutionSpec,
    type QueryHistory,
    type ResultColumns,
    type SourceQuery,
} from '@lightdash/common';
import { Readable } from 'stream';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { DuckdbSandboxRunner } from '../AsyncQueryService/duckdb/DuckdbSandboxRunner';
import { LocalProcessSandboxProvider } from '../AsyncQueryService/sandbox/LocalProcessSandboxProvider';
import type { ICacheService } from '../CacheService/ICacheService';
import type { CacheHitCacheResult } from '../CacheService/types';
import {
    projectSummary,
    sessionAccount,
    user,
} from '../ProjectService/ProjectService.mock';
import { QuerySourceRegistry } from './QuerySourceRegistry';
import { QuerySourceService } from './QuerySourceService';

const { projectUuid, organizationUuid } = projectSummary;
const ordersUuid = '0b7c9c62-4b6e-4b1a-9c3e-4f6a0c8d2e11';

type Row = QueryHistory & {
    cacheKey: string;
    duckdbExecution: DuckdbExecutionSpec | null;
};

const toJsonl = (rows: Record<string, unknown>[]) =>
    Buffer.from(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

const ordersRows = [
    { customer: 'ann', region: 'EMEA', amount: 10 },
    { customer: 'bob', region: 'AMER', amount: 5 },
    { customer: 'ann', region: 'AMER', amount: 7 },
    { customer: 'cat', region: 'EMEA', amount: 1 },
];

/** The source node's landed result: what a semantic-layer run leaves behind. */
const ordersResult = {
    queryUuid: ordersUuid,
    projectUuid,
    organizationUuid,
    createdByUserUuid: sessionAccount.user.id,
    context: QueryExecutionContext.AI,
    status: QueryHistoryStatus.READY,
    resultsFileName: 'orders-file',
    resultsExpiresAt: null,
    totalRowCount: ordersRows.length,
    columns: {
        customer: { reference: 'customer', type: DimensionType.STRING },
        region: { reference: 'region', type: DimensionType.STRING },
        amount: { reference: 'amount', type: DimensionType.NUMBER },
    } as unknown as ResultColumns,
    fields: {},
    metricQuery: {},
    requestParameters: {},
    defaultPageSize: null,
    createdAt: new Date(),
    cacheKey: `key-${ordersUuid}`,
    duckdbExecution: null,
} as unknown as Row;

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
    default_page_size: 'defaultPageSize',
};

class RecordingProvider extends LocalProcessSandboxProvider {
    readonly created: string[] = [];

    async create() {
        const handle = await super.create();
        this.created.push(handle.sandboxId);
        return handle;
    }
}

/**
 * A query-source pipeline over a landed source result, with the database,
 * object storage and sandbox provider as the only fakes: the provider runs
 * the real runner script and real DuckDB in a local process.
 */
const buildPipeline = () => {
    const files = new Map<string, Buffer>([
        ['orders-file', toJsonl(ordersRows)],
    ]);
    const rows = new Map<string, Row>([[ordersUuid, ordersResult]]);
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
                    projectUuid,
                    status: QueryHistoryStatus.PENDING,
                    createdAt: new Date(),
                    createdByUserUuid: sessionAccount.user.id,
                    createdByActorType: sessionAccount.authentication.type,
                    defaultPageSize: null,
                    duckdbExecution: null,
                } as Row);
                return { queryUuid };
            },
        ),
        get: vi.fn(async (queryUuid: string) => rows.get(queryUuid)),
        getByQueryUuid: vi.fn(async (queryUuid: string) => rows.get(queryUuid)),
        // The real backoff loop over the in-memory rows
        pollForQueryCompletion:
            QueryHistoryModel.prototype.pollForQueryCompletion,
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
    const projectModel = {
        getSummary: vi.fn(async () => projectSummary),
        getEffectiveResultsCacheTtlSeconds: vi.fn(async () => 3600),
    };
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.ComposeSqlRunner ||
                featureFlagId === FeatureFlags.MultiSourceQuery,
        })),
    };
    const provider = new RecordingProvider();
    const asyncQueryService = new AsyncQueryService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        queryHistoryModel,
        cacheService,
        resultsStorageClient,
        natsClient: {
            enqueueWarehouseQuery: vi.fn(),
            enqueuePreAggregateQuery: vi.fn(),
        },
        projectModel,
        projectParametersModel: { find: vi.fn(async () => []) },
        userModel: { findSessionUserAndOrgByUuid: vi.fn(async () => user) },
        featureFlagModel,
        aiAccessService: {
            assertCanReadResults: vi.fn(async () => null),
            assertCanReadResultsForQueries: vi.fn(async () => new Map()),
        },
    } as unknown as ConstructorParameters<typeof AsyncQueryService>[0]);
    Object.assign(asyncQueryService, {
        duckdbSandboxRunner: new DuckdbSandboxRunner({
            lightdashConfig: lightdashConfigMock,
            logger: {
                info: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
            },
            provider,
            runnerSource: null,
        }),
    });
    vi.spyOn(asyncQueryService, 'getUserAttributes').mockResolvedValue({
        userAttributes: {},
        intrinsicUserAttributes: {},
    });

    const querySourceService = new QuerySourceService({
        getAsyncQueryService: () => asyncQueryService,
        getAgentPermissionService: () => ({
            loadRequest: vi.fn(),
            assertOperationWithRequest: vi.fn(),
        }),
        projectModel: projectModel as never,
        queryHistoryModel: queryHistoryModel as unknown as QueryHistoryModel,
        featureFlagModel: featureFlagModel as never,
        registry: QuerySourceRegistry.withBuiltInSources({
            asyncQueryService,
            projectService: {} as never,
        }),
    });

    const submit = (queries: SourceQuery[]) =>
        querySourceService.submitQueries({
            account: sessionAccount,
            projectUuid,
            queries,
            context: QueryExecutionContext.AI,
            parameters: {},
            userAttributeOverrides: {},
            invalidateCache: false,
            plans: {},
        });

    const execute = (queries: SourceQuery[]) =>
        querySourceService.executeSourceQueries({
            account: sessionAccount,
            projectUuid,
            queries,
            context: QueryExecutionContext.AI,
            parameters: {},
            userAttributeOverrides: {},
            invalidateCache: false,
        });

    const waitForTerminal = async (queryUuid: string) => {
        await vi.waitFor(
            () => {
                expect([
                    QueryHistoryStatus.READY,
                    QueryHistoryStatus.ERROR,
                ]).toContain(rows.get(queryUuid)?.status);
            },
            { timeout: 30_000, interval: 25 },
        );
        return rows.get(queryUuid)!;
    };

    const fetchResults = (queryUuid: string) =>
        asyncQueryService.getAsyncQueryResults({
            account: sessionAccount,
            projectUuid,
            queryUuid,
        });

    return {
        asyncQueryService,
        querySourceService,
        rows,
        provider,
        submit,
        execute,
        waitForTerminal,
        fetchResults,
    };
};

const byCustomer: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'by_customer',
    sql: 'SELECT customer, SUM(amount) AS total FROM orders GROUP BY customer',
    references: { orders: ordersUuid },
};

const topCustomers: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'top_customers',
    sql: 'SELECT customer, total FROM by_customer WHERE total > 2 ORDER BY total DESC',
    references: ['by_customer'],
};

const valuesOf = (rows: Record<string, { value: { raw: unknown } }>[]) =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, { value }]) => [key, value.raw]),
        ),
    );

describe('a query-source pipeline runs its DuckDB nodes in one-shot sandboxes', () => {
    test('chained SQL transformations run in dependency order, each over the last', async () => {
        const { execute, waitForTerminal, fetchResults, provider } =
            buildPipeline();

        // Listed downstream-first: submission order comes from the references
        const { queries } = await execute([topCustomers, byCustomer]);

        expect(queries.map(({ nodeId }) => nodeId)).toEqual([
            'by_customer',
            'top_customers',
        ]);
        const [first, last] = queries;
        const terminal = await waitForTerminal(last.queryUuid);
        expect(terminal.error ?? null).toBeNull();
        expect((await waitForTerminal(first.queryUuid)).status).toBe(
            QueryHistoryStatus.READY,
        );
        expect(terminal.duckdbExecution).toMatchObject({
            references: { by_customer: first.queryUuid },
            cacheHit: false,
        });

        const results = await fetchResults(last.queryUuid);
        expect(results.status).toBe(QueryHistoryStatus.READY);
        if (results.status !== QueryHistoryStatus.READY) return;
        expect(valuesOf(results.rows as never)).toEqual([
            { customer: 'ann', total: 17 },
            { customer: 'bob', total: 5 },
        ]);
        expect(results.totalResults).toBe(2);
        expect(Object.keys(results.columns)).toEqual(['customer', 'total']);
        expect(results.columns.total).toMatchObject({
            reference: 'total',
            type: DimensionType.NUMBER,
        });
        expect(provider.created).toHaveLength(2);
    }, 60_000);

    test('resubmitting the same pipeline is served from the earlier results without a sandbox', async () => {
        const { submit, waitForTerminal, fetchResults, provider } =
            buildPipeline();
        const firstRun = await submit([byCustomer, topCustomers]);
        await waitForTerminal(firstRun.queries[1].queryUuid);

        const { queries } = await submit([byCustomer, topCustomers]);
        const nodes = await Promise.all(
            queries.map(({ queryUuid }) => waitForTerminal(queryUuid)),
        );

        expect(nodes.map((node) => node.duckdbExecution?.cacheHit)).toEqual([
            true,
            true,
        ]);
        expect(provider.created).toHaveLength(2);
        const results = await fetchResults(queries[1].queryUuid);
        if (results.status !== QueryHistoryStatus.READY)
            throw new Error(`results are ${results.status}`);
        expect(valuesOf(results.rows as never)).toEqual([
            { customer: 'ann', total: 17 },
            { customer: 'bob', total: 5 },
        ]);
    }, 60_000);

    test('a pivoted transformation downstream of another returns one column per group', async () => {
        const { submit, waitForTerminal, fetchResults } = buildPipeline();
        const tagged: SourceQuery = {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'tagged',
            sql: "SELECT customer, region, amount, CASE WHEN amount >= 5 THEN 'big' ELSE 'small' END AS size FROM orders",
            references: { orders: ordersUuid },
        };
        const pivoted: SourceQuery = {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'pivoted',
            sql: 'SELECT region, size, amount FROM tagged',
            references: ['tagged'],
            pivotConfiguration: {
                indexColumn: {
                    reference: 'region',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'size' }],
                sortBy: [
                    { reference: 'region', direction: SortByDirection.ASC },
                ],
            },
        };

        const { queries } = await submit([pivoted, tagged]);
        const terminal = await waitForTerminal(queries[1].queryUuid);

        expect(terminal.error ?? null).toBeNull();
        const results = await fetchResults(queries[1].queryUuid);
        if (results.status !== QueryHistoryStatus.READY)
            throw new Error(`results are ${results.status}`);
        expect(Object.keys(results.columns)).toEqual([
            'region',
            'amount_sum_big',
            'amount_sum_small',
        ]);
        expect(valuesOf(results.rows as never)).toEqual([
            { region: 'AMER', amount_sum_big: 12 },
            { region: 'EMEA', amount_sum_big: 10, amount_sum_small: 1 },
        ]);
        expect(results.pivotDetails).toMatchObject({
            totalColumnCount: 2,
            indexColumn: { reference: 'region' },
            groupByColumns: [{ reference: 'size' }],
        });
    }, 60_000);

    test('a node of a later version reads a reused result by its query uuid', async () => {
        const { submit, waitForTerminal, fetchResults, provider } =
            buildPipeline();
        const earlierVersion = await submit([byCustomer]);
        const reusedUuid = earlierVersion.queries[0].queryUuid;
        await waitForTerminal(reusedUuid);

        const { queries } = await submit([
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'ranked',
                sql: 'SELECT customer, total, CAST(rank() OVER (ORDER BY total DESC) AS INTEGER) AS position FROM by_customer ORDER BY position',
                references: { by_customer: reusedUuid },
            },
        ]);
        const terminal = await waitForTerminal(queries[0].queryUuid);

        expect(terminal.error ?? null).toBeNull();
        expect(terminal.duckdbExecution?.references).toEqual({
            by_customer: reusedUuid,
        });
        const results = await fetchResults(queries[0].queryUuid);
        if (results.status !== QueryHistoryStatus.READY)
            throw new Error(`results are ${results.status}`);
        expect(valuesOf(results.rows as never)).toEqual([
            { customer: 'ann', total: 17, position: 1 },
            { customer: 'bob', total: 5, position: 2 },
            { customer: 'cat', total: 1, position: 3 },
        ]);
        expect(provider.created).toHaveLength(2);
    }, 60_000);

    describe('without a sandbox provider', () => {
        const ordersSource: SourceQuery = {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: ['orders_customer'],
            metrics: ['orders_total_amount'],
        };
        const fromOrders: SourceQuery = {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'by_customer',
            sql: 'SELECT customer, SUM(amount) AS total FROM orders GROUP BY customer',
            references: ['orders'],
        };

        test.each([
            ['submitQueries', 'submit'],
            ['executeSourceQueries', 'execute'],
        ] as const)(
            '%s refuses a pipeline with a SQL transformation before submitting any node',
            async (_name, method) => {
                const pipeline = buildPipeline();
                Object.assign(pipeline.asyncQueryService, {
                    duckdbSandboxRunner: null,
                });
                const rowsBefore = pipeline.rows.size;

                const error = await pipeline[method]([
                    ordersSource,
                    fromOrders,
                ]).catch((e: unknown) => e);

                expect(error).toBeInstanceOf(MissingConfigError);
                expect((error as Error).message).toMatch(/E2B_API_KEY/);
                expect(pipeline.rows.size).toBe(rowsBefore);
            },
        );
    });
});
