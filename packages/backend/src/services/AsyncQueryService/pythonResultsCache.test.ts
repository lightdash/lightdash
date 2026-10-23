import {
    DimensionType,
    FeatureFlags,
    QueryExecutionContext,
    QueryHistoryStatus,
    type QueryHistory,
} from '@lightdash/common';
import { Readable } from 'stream';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { ICacheService } from '../CacheService/ICacheService';
import type { CacheHitCacheResult } from '../CacheService/types';
import {
    projectSummary,
    sessionAccount,
} from '../ProjectService/ProjectService.mock';
import { AsyncQueryService } from './AsyncQueryService';
import type {
    PythonSandboxRunArgs,
    PythonSandboxRunResult,
} from './python/PythonSandboxRunner';

const { projectUuid, organizationUuid } = projectSummary;
const ordersUuid = '0b7c9c62-4b6e-4b1a-9c3e-4f6a0c8d2e11';
const ordersAgainUuid = '5d3a1f08-7c2e-4e9b-8a61-2f4b9c0e7d33';
const customersUuid = '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a';
const code = 'def run(inputs, params):\n    return inputs["orders"]';

type Row = QueryHistory & { cacheKey: string };

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
        totalRowCount: 1,
        columns: { id: { reference: 'id', type: DimensionType.NUMBER } },
        fields: {},
        requestParameters: {},
        cacheKey: `key-${queryUuid}`,
        ...extra,
    }) as unknown as Row;

/**
 * Python transformations over stored results, with the database, object
 * storage and sandbox as the only fakes. The cache lookup reads rows the way
 * the results cache does: the latest ready row stored under the key.
 */
const buildHarness = ({
    flags = {},
    sandboxVersion = 'lightdash-python-runner:1.0.0',
}: {
    flags?: Partial<Record<FeatureFlags, boolean>>;
    sandboxVersion?: string;
} = {}) => {
    const rows = new Map<string, Row>([
        [ordersUuid, readyResult(ordersUuid, 'orders-file')],
        [ordersAgainUuid, readyResult(ordersAgainUuid, 'orders-file')],
        [customersUuid, readyResult(customersUuid, 'customers-file')],
    ]);
    let created = 0;
    const queryHistoryModel = {
        create: vi.fn(
            async (
                _account: unknown,
                args: Parameters<QueryHistoryModel['create']>[1],
            ) => {
                created += 1;
                const queryUuid = `python-${created}`;
                rows.set(queryUuid, {
                    ...(args as unknown as Row),
                    queryUuid,
                    status: QueryHistoryStatus.PENDING,
                    createdAt: new Date(),
                    createdByUserUuid: sessionAccount.user.id,
                } as Row);
                return { queryUuid };
            },
        ),
        get: vi.fn(async (queryUuid: string) => rows.get(queryUuid)),
        pollForQueryCompletion: vi.fn(
            async ({ queryUuid }: { queryUuid: string }) => rows.get(queryUuid),
        ),
        recordResultProducer: vi.fn(),
        update: vi.fn(
            async (
                queryUuid: string,
                _projectUuid: string,
                update: Record<string, unknown>,
            ) => {
                const row = rows.get(queryUuid)!;
                rows.set(queryUuid, {
                    ...row,
                    ...(update.status ? { status: update.status } : {}),
                    ...(update.error !== undefined
                        ? { error: update.error }
                        : {}),
                    ...(update.cache_key
                        ? { cacheKey: update.cache_key as string }
                        : {}),
                    ...(update.results_file_name
                        ? {
                              resultsFileName:
                                  update.results_file_name as string,
                          }
                        : {}),
                    ...(update.results_created_at
                        ? {
                              resultsCreatedAt:
                                  update.results_created_at as Date,
                          }
                        : {}),
                    ...(update.results_updated_at
                        ? {
                              resultsUpdatedAt:
                                  update.results_updated_at as Date,
                          }
                        : {}),
                    ...(update.results_expires_at
                        ? {
                              resultsExpiresAt:
                                  update.results_expires_at as Date,
                          }
                        : {}),
                    ...(update.total_row_count !== undefined
                        ? { totalRowCount: update.total_row_count as number }
                        : {}),
                    ...(update.columns
                        ? { columns: update.columns as Row['columns'] }
                        : {}),
                } as Row);
            },
        ),
        updateStatusToError: vi.fn(
            async (queryUuid: string, _projectUuid: string, error: string) => {
                const row = rows.get(queryUuid)!;
                rows.set(queryUuid, {
                    ...row,
                    status: QueryHistoryStatus.ERROR,
                    error,
                });
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
                    originalColumns: null,
                    pivotValuesColumns: null,
                    pivotTotalColumnCount: null,
                };
            },
        ),
    };
    const uploads: string[] = [];
    const resultsStorageClient = {
        isEnabled: true,
        getDownloadStream: vi.fn(async () => Readable.from(['{"id":1}\n'])),
        createUploadStream: vi.fn((fileName: string) => {
            uploads.push(fileName);
            return { write: vi.fn(), close: vi.fn() };
        }),
    };
    const sandbox = {
        version: sandboxVersion,
        run: vi.fn(
            async (
                _args: PythonSandboxRunArgs,
            ): Promise<PythonSandboxRunResult> => ({
                resultJsonl: Buffer.from('{"id":1}\n'),
                resultMeta: JSON.stringify({
                    columns: [{ name: 'id', type: 'number' }],
                    rowCount: 1,
                    truncated: false,
                    timings: {
                        importMs: 0,
                        loadInputsMs: 0,
                        loadCodeMs: 0,
                        runMs: 0,
                        writeOutputMs: 0,
                    },
                }),
                stdout: '',
            }),
        ),
    };
    const service = new AsyncQueryService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        queryHistoryModel,
        cacheService,
        resultsStorageClient,
        projectModel: {
            getSummary: vi.fn(async () => projectSummary),
            getEffectiveResultsCacheTtlSeconds: vi.fn(async () => 3600),
        } as unknown as ProjectModel,
        featureFlagModel: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled:
                        flags[featureFlagId as FeatureFlags] ??
                        featureFlagId === FeatureFlags.ComposeSqlRunner,
                }),
            ),
        } as unknown as FeatureFlagModel,
        aiAccessService: {
            assertCanReadResultsForQueries: vi.fn(async () => new Map()),
        },
    } as unknown as ConstructorParameters<typeof AsyncQueryService>[0]);
    Object.assign(service, { pythonSandboxRunner: sandbox });
    vi.spyOn(service, 'getUserAttributes').mockResolvedValue({
        userAttributes: {},
        intrinsicUserAttributes: {},
    });

    const submit = async (
        overrides: Partial<
            Parameters<AsyncQueryService['executeAsyncPythonQuery']>[0]
        > = {},
    ) => {
        const { queryUuid } = await service.executeAsyncPythonQuery({
            account: sessionAccount,
            projectUuid,
            context: QueryExecutionContext.AI,
            code,
            references: { orders: ordersUuid },
            ...overrides,
        });
        await vi.waitFor(() => {
            expect(rows.get(queryUuid)?.status).not.toBe(
                QueryHistoryStatus.PENDING,
            );
        });
        return rows.get(queryUuid)!;
    };

    return { submit, sandbox, uploads, rows };
};

describe('python transformations and the results cache', () => {
    test('the same python node over the same result files is served from the results cache without a sandbox', async () => {
        const { submit, sandbox } = await buildHarness();

        const first = await submit();
        const second = await submit();

        expect(sandbox.run).toHaveBeenCalledTimes(1);
        expect(second).toMatchObject({
            status: QueryHistoryStatus.READY,
            resultsFileName: first.resultsFileName,
            totalRowCount: 1,
            columns: { id: { reference: 'id', type: DimensionType.NUMBER } },
        });
    });

    test('a python node downstream of an input served from cache still hits: it is keyed on files, not query ids', async () => {
        const { submit, sandbox } = await buildHarness();

        const first = await submit({ references: { orders: ordersUuid } });
        const second = await submit({
            references: { orders: ordersAgainUuid },
        });

        expect(sandbox.run).toHaveBeenCalledTimes(1);
        expect(second.resultsFileName).toBe(first.resultsFileName);
    });

    test.each([
        [
            'code',
            {
                code: 'def run(inputs, params):\n    return inputs["orders"].head(1)',
            },
        ],
        ['limit', { limit: 10 }],
        ['parameter', { parameters: { region: 'EMEA' } }],
        ['input file', { references: { orders: customersUuid } }],
        ['input name', { references: { sales: ordersUuid } }],
    ])('a different %s runs the sandbox again', async (_change, overrides) => {
        const { submit, sandbox } = await buildHarness();

        const first = await submit();
        const second = await submit(overrides);

        expect(sandbox.run).toHaveBeenCalledTimes(2);
        expect(second.status).toBe(QueryHistoryStatus.READY);
        expect(second.resultsFileName).not.toBe(first.resultsFileName);
    });

    test('a new sandbox version runs the sandbox again', async () => {
        const { submit, sandbox } = await buildHarness();

        await submit();
        sandbox.version = 'lightdash-python-runner:2.0.0';
        await submit();

        expect(sandbox.run).toHaveBeenCalledTimes(2);
    });

    test('parameters reach the python code as params', async () => {
        const { submit, sandbox } = await buildHarness();

        await submit({ parameters: { region: 'EMEA' } });

        expect(sandbox.run.mock.calls[0][0].inputMeta.params).toEqual({
            region: 'EMEA',
        });
    });

    test('results stored on a miss expire after the project results TTL', async () => {
        const { submit } = await buildHarness();

        const before = Date.now();
        const row = await submit();

        const ttlMs = row.resultsExpiresAt!.getTime() - before;
        expect(ttlMs).toBeGreaterThanOrEqual(3600 * 1000);
        expect(ttlMs).toBeLessThan(3600 * 1000 + 5000);
    });

    describe('bypasses the results cache like SQL transformations', () => {
        test('when the submitter invalidates the cache', async () => {
            const { submit, sandbox } = await buildHarness();

            await submit();
            await submit({ invalidateCache: true });

            expect(sandbox.run).toHaveBeenCalledTimes(2);
        });

        test('for agent queries when the AI skip results cache flag is on', async () => {
            const { submit, sandbox } = await buildHarness({
                flags: { [FeatureFlags.AiAccessSkipResultsCache]: true },
            });

            await submit();
            await submit();

            expect(sandbox.run).toHaveBeenCalledTimes(2);
        });

        test('for agent queries over results produced with agent credentials', async () => {
            const { submit, sandbox, rows } = await buildHarness();
            rows.set(
                ordersUuid,
                readyResult(ordersUuid, 'orders-file', {
                    requestParameters: {
                        aiSignInCredentialUuid: 'credential-uuid',
                    } as unknown as QueryHistory['requestParameters'],
                }),
            );

            await submit();
            await submit();

            expect(sandbox.run).toHaveBeenCalledTimes(2);
        });

        test('when agent identity is on', async () => {
            const { submit, sandbox } = await buildHarness({
                flags: { [FeatureFlags.AgentIdentity]: true },
            });

            await submit();
            await submit();

            expect(sandbox.run).toHaveBeenCalledTimes(2);
        });

        test('the AI skip flag does not apply outside agent queries', async () => {
            const { submit, sandbox } = await buildHarness({
                flags: { [FeatureFlags.AiAccessSkipResultsCache]: true },
            });

            await submit({ context: QueryExecutionContext.PYTHON_RUNNER });
            await submit({ context: QueryExecutionContext.PYTHON_RUNNER });

            expect(sandbox.run).toHaveBeenCalledTimes(1);
        });
    });
});
