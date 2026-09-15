import { DimensionType, type WarehouseClient } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import {
    metricQueryMock,
    preAggregateExplore,
    validExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { warehouseClientMock } from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import { hashPreAggregateCompatibility } from '../PreAggregateMaterializationService/preAggregatePreparation';
import {
    PreAggregationDuckDbClient,
    PreAggregationDuckDbResolveReason,
} from './PreAggregationDuckDbClient';

vi.mock('../../../utils/QueryBuilder/QueryComposer', () => ({
    QueryComposer: vi.fn(
        function MockQueryComposer(this: { getSql: () => string }) {
            this.getSql = vi.fn().mockReturnValue('SELECT * FROM test');
        },
    ),
}));

const QueryComposerMock = vi.mocked(QueryComposer);

describe('PreAggregationDuckDbClient', () => {
    const getClient = ({
        lightdashConfig,
        materializationUri = 's3://mock_preagg_bucket/abc123.jsonl',
        activeMaterialization = {
            publicationVersion: 'publication',
            compatibilityHash: 'hash',
            evaluatedAt: new Date('2024-01-01'),
            physicalOutputContract: null,
            pinnedContextHash: null,
            materializationUuid: 'mat-1',
            queryUuid: 'mat-query-1',
            materializationUri,
            format: 'jsonl' as const,
            columns: null,
            materializedAt: new Date('2024-01-01T00:00:00.000Z'),
            totalBytes: 987654,
        },
    }: {
        lightdashConfig?: typeof lightdashConfigMock;
        materializationUri?: string;
        activeMaterialization?: Awaited<
            ReturnType<PreAggregateModel['getActiveMaterialization']>
        >;
    } = {}) => {
        const resolvedLightdashConfig = {
            ...lightdashConfigMock,
            ...lightdashConfig,
            preAggregates: {
                ...lightdashConfigMock.preAggregates,
                ...lightdashConfig?.preAggregates,
                enabled: lightdashConfig?.preAggregates?.enabled ?? true,
            },
        };
        const preAggregateModel = {
            getServingSnapshot: vi.fn().mockResolvedValue({
                activeMaterialization,
                sourceExplore: validExplore,
                preAggExplore: preAggregateExplore,
            }),
        };
        const preAggregateResultsStorageClient = {
            getFileSize: vi.fn().mockResolvedValue(987654),
        };
        const createDuckdbWarehouseClient = vi
            .fn()
            .mockReturnValue(warehouseClientMock as unknown as WarehouseClient);

        const client = new PreAggregationDuckDbClient({
            lightdashConfig: resolvedLightdashConfig,
            preAggregateModel:
                preAggregateModel as unknown as PreAggregateModel,
            preAggregateResultsStorageClient,
            sharedResourceLimits: resolvedLightdashConfig.preAggregates
                .duckdbQueryMemoryLimit
                ? {
                      memoryLimit:
                          resolvedLightdashConfig.preAggregates
                              .duckdbQueryMemoryLimit,
                  }
                : undefined,
            createDuckdbWarehouseClient,
        });

        return {
            client,
            preAggregateModel,
            preAggregateResultsStorageClient,
            createDuckdbWarehouseClient,
        };
    };

    const baseResolveArgs = {
        projectUuid: 'projectUuid',
        metricQuery: {
            ...metricQueryMock,
            tableCalculations: [],
        },
        timezone: 'UTC',
        dateZoom: undefined,
        parameters: { region: 'us-east' },
        preAggregationRoute: {
            sourceExploreName: 'valid_explore',
            preAggregateName: 'rollup',
            mode: 'required' as const,
        },
        fieldsMap: {},
        pivotConfiguration: undefined,
        startOfWeek: undefined,
        userAccessControls: {
            userAttributes: {},
            intrinsicUserAttributes: {},
        },
        availableParameterDefinitions: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        QueryComposerMock.mockImplementation(function MockQueryComposer(this: {
            getSql: () => string;
        }) {
            this.getSql = vi.fn().mockReturnValue('SELECT * FROM test');
            return this;
        } as unknown as () => QueryComposer);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('returns unresolved when no active materialization exists', async () => {
        const { client, preAggregateModel } = getClient();
        preAggregateModel.getServingSnapshot.mockResolvedValue(undefined);

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
        });
        expect(
            preAggregateModel.getServingSnapshot,
        ).toHaveBeenCalledExactlyOnceWith(
            'projectUuid',
            '__preagg__valid_explore__rollup',
        );
    });

    test('returns unresolved when pre-aggregate S3 config is missing', async () => {
        const { client, preAggregateModel } = getClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                    s3: undefined,
                },
            },
        });

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.MISSING_PRE_AGGREGATE_S3_CONFIG,
        });
        expect(preAggregateModel.getServingSnapshot).not.toHaveBeenCalled();
    });

    test.each(['missing', 'unreadable'])(
        'returns the ordinary fallback when the managed object is %s',
        async (failure) => {
            const {
                client,
                preAggregateResultsStorageClient,
                createDuckdbWarehouseClient,
            } = getClient();
            if (failure === 'missing') {
                preAggregateResultsStorageClient.getFileSize.mockResolvedValue(
                    null,
                );
            } else {
                preAggregateResultsStorageClient.getFileSize.mockRejectedValue(
                    new Error('Storage unavailable'),
                );
            }

            expect(await client.resolve(baseResolveArgs)).toEqual({
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            });
            expect(
                preAggregateResultsStorageClient.getFileSize,
            ).toHaveBeenCalledWith('abc123.jsonl', 'jsonl');
            expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
            expect(QueryComposerMock).not.toHaveBeenCalled();
        },
    );

    test.each([
        's3://foreign-bucket/abc123.jsonl',
        'https://mock_preagg_bucket/abc123.jsonl',
        'invalid-uri',
        's3://mock_preagg_bucket/%invalid.jsonl',
    ])(
        'rejects unsupported managed object URI %s before storage access',
        async (materializationUri) => {
            const {
                client,
                preAggregateResultsStorageClient,
                createDuckdbWarehouseClient,
            } = getClient({ materializationUri });
            expect(await client.resolve(baseResolveArgs)).toEqual({
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            });
            expect(
                preAggregateResultsStorageClient.getFileSize,
            ).not.toHaveBeenCalled();
            expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
        },
    );

    test('accepts a zero-byte managed object and checks its decoded durable key', async () => {
        const { client, preAggregateResultsStorageClient } = getClient({
            materializationUri:
                's3://mock_preagg_bucket/folder/empty%20result.jsonl',
        });
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(0);
        expect(await client.resolve(baseResolveArgs)).toEqual({
            resolved: true,
            query: 'SELECT * FROM test',
            warehouseClient: warehouseClientMock,
        });
        expect(
            preAggregateResultsStorageClient.getFileSize,
        ).toHaveBeenCalledWith('folder/empty result.jsonl', 'jsonl');
    });

    test('creates the pre-aggregate DuckDB client from the pre-aggregate S3 config', () => {
        const createForPreAggregateSpy = vi.spyOn(
            DuckdbWarehouseClient,
            'createForPreAggregate',
        );
        const client = new PreAggregationDuckDbClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            },
            preAggregateModel: {
                getServingSnapshot: vi.fn(),
            },
            preAggregateResultsStorageClient: {
                getFileSize: vi.fn(),
            },
        });

        const warehouseClient = client.createPreAggregateWarehouseClient();

        expect(warehouseClient).toBeInstanceOf(DuckdbWarehouseClient);
        expect(createForPreAggregateSpy).toHaveBeenCalledWith(
            {
                type: 'duckdb_s3',
                s3Config: {
                    endpoint: 'mock_endpoint',
                    region: 'mock_region',
                    accessKey: undefined,
                    secretKey: undefined,
                    forcePathStyle: false,
                    useSsl: true,
                },
            },
            expect.objectContaining({
                instanceCacheKey: 'pre-aggregate-query-instance',
            }),
        );
    });

    test('returns resolved DuckDB query/client and patches pre-aggregate sqlTable', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT * FROM test',
            warehouseClient: warehouseClientMock,
        });
        expect(QueryComposerMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                explore: expect.objectContaining({
                    name: '__preagg__valid_explore__rollup',
                    tables: expect.objectContaining({
                        a: expect.objectContaining({
                            sqlTable:
                                "read_json_auto('s3://mock_preagg_bucket/abc123.jsonl')",
                        }),
                        b: expect.objectContaining({
                            sqlTable:
                                "read_json_auto('s3://mock_preagg_bucket/abc123.jsonl')",
                        }),
                    }),
                }),
            }),
        );
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({
                instanceCacheKey: 'pre-aggregate-query-instance',
            }),
        );
    });

    test('passes the configured shared DuckDB resource limits to the warehouse client', async () => {
        const { client, createDuckdbWarehouseClient } = getClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                    duckdbQueryMemoryLimit: '3GB',
                },
            },
        });

        await client.resolve(baseResolveArgs);

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({
                sharedResourceLimits: {
                    memoryLimit: '3GB',
                },
                instanceCacheKey: 'pre-aggregate-query-instance',
            }),
        );
    });

    test('rejects routing prepared from an obsolete source snapshot', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();
        const result = await client.resolve({
            ...baseResolveArgs,
            preAggregationRoute: {
                ...baseResolveArgs.preAggregationRoute,
                routingSnapshot: {
                    exploreName: validExplore.name,
                    fingerprint: 'obsolete',
                },
            },
        });
        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
        });
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    test('resolves the current source and generated explore from one snapshot', async () => {
        const { client, preAggregateModel } = getClient();
        const result = await client.resolve({
            ...baseResolveArgs,
            preAggregationRoute: {
                ...baseResolveArgs.preAggregationRoute,
                routingSnapshot: {
                    exploreName: validExplore.name,
                    fingerprint: hashPreAggregateCompatibility(validExplore),
                },
            },
        });
        expect(result.resolved).toBe(true);
        expect(preAggregateModel.getServingSnapshot).toHaveBeenCalledOnce();
    });

    test('rejects a materialization whose effective context cannot be verified', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();
        const result = await client.resolve({
            ...baseResolveArgs,
            preAggregationRoute: {
                ...baseResolveArgs.preAggregationRoute,
                compatibilityCheck: { status: 'unavailable' },
            },
        });
        expect(result.resolved).toBe(false);
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    test('logs selected materialization metadata for debugging', async () => {
        const loggerSpy = vi
            .spyOn(Logger, 'info')
            .mockImplementation(() => Logger);
        const { client } = getClient();

        await client.resolve({
            ...baseResolveArgs,
            queryUuid: 'query-123',
        });

        expect(loggerSpy).toHaveBeenCalledWith(
            'DuckDB pre-agg materialization selected',
            expect.objectContaining({
                queryUuid: 'query-123',
                projectUuid: 'projectUuid',
                preAggExploreName: '__preagg__valid_explore__rollup',
                materializationUuid: 'mat-1',
                materializationQueryUuid: 'mat-query-1',
                materializationBytes: 987654,
            }),
        );
    });

    test('uses active materialization columns as DuckDB JSON schema when available', async () => {
        const { client } = getClient({
            activeMaterialization: {
                publicationVersion: 'publication',
                compatibilityHash: 'hash',
                evaluatedAt: new Date('2024-01-01'),
                physicalOutputContract: null,
                pinnedContextHash: null,
                materializationUuid: 'mat-1',
                queryUuid: 'mat-query-1',
                materializationUri: 's3://mock_preagg_bucket/abc123.jsonl',
                format: 'jsonl',
                columns: {
                    a_dim1: {
                        reference: 'a.dim1',
                        type: DimensionType.STRING,
                    },
                    a_met_count: {
                        reference: 'a.met_count',
                        type: DimensionType.NUMBER,
                    },
                    a_created_at: {
                        reference: 'a.created_at',
                        type: DimensionType.TIMESTAMP,
                    },
                },
                materializedAt: new Date('2024-01-01T00:00:00.000Z'),
                totalBytes: 987654,
            },
        });

        await client.resolve(baseResolveArgs);

        expect(QueryComposerMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                explore: expect.objectContaining({
                    tables: expect.objectContaining({
                        a: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_preagg_bucket/abc123.jsonl', columns={"a_dim1": 'VARCHAR', "a_met_count": 'DOUBLE', "a_created_at": 'TIMESTAMP'}, format='newline_delimited')`,
                        }),
                        b: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_preagg_bucket/abc123.jsonl', columns={"a_dim1": 'VARCHAR', "a_met_count": 'DOUBLE', "a_created_at": 'TIMESTAMP'}, format='newline_delimited')`,
                        }),
                    }),
                }),
            }),
        );
    });

    test('preserves decomposed average component columns in DuckDB JSON schema', async () => {
        const { client } = getClient({
            activeMaterialization: {
                publicationVersion: 'publication',
                compatibilityHash: 'hash',
                evaluatedAt: new Date('2024-01-01'),
                physicalOutputContract: null,
                pinnedContextHash: null,
                materializationUuid: 'mat-1',
                queryUuid: 'mat-query-1',
                materializationUri: 's3://mock_preagg_bucket/abc123.jsonl',
                format: 'jsonl',
                columns: {
                    a_avg_revenue__sum: {
                        reference: 'a.avg_revenue__sum',
                        type: DimensionType.NUMBER,
                    },
                    a_avg_revenue__count: {
                        reference: 'a.avg_revenue__count',
                        type: DimensionType.NUMBER,
                    },
                },
                materializedAt: new Date('2024-01-01T00:00:00.000Z'),
                totalBytes: 987654,
            },
        });

        await client.resolve(baseResolveArgs);

        expect(QueryComposerMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                explore: expect.objectContaining({
                    tables: expect.objectContaining({
                        a: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_preagg_bucket/abc123.jsonl', columns={"a_avg_revenue__sum": 'DOUBLE', "a_avg_revenue__count": 'DOUBLE'}, format='newline_delimited')`,
                        }),
                        b: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_preagg_bucket/abc123.jsonl', columns={"a_avg_revenue__sum": 'DOUBLE', "a_avg_revenue__count": 'DOUBLE'}, format='newline_delimited')`,
                        }),
                    }),
                }),
            }),
        );
    });
});
