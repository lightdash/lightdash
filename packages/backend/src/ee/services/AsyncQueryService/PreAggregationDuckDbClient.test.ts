import {
    CustomDimensionType,
    DimensionType,
    MissingConfigError,
    type CustomSqlDimension,
    type WarehouseClient,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    metricQueryMock,
    preAggregateExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { warehouseClientMock } from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import {
    getPreAggregateQueryInstanceCacheKey,
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
        activeMaterialization = {
            materializationUuid: 'mat-1',
            queryUuid: 'mat-query-1',
            materializationUri: 's3://mock_preagg_bucket/abc123.jsonl',
            format: 'jsonl' as const,
            columns: null,
            materializedAt: new Date('2024-01-01T00:00:00.000Z'),
            totalBytes: 987654,
        },
    }: {
        lightdashConfig?: typeof lightdashConfigMock;
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
            getActiveMaterialization: vi
                .fn()
                .mockResolvedValue(activeMaterialization),
            findMaterializationUrisForProject: vi
                .fn()
                .mockResolvedValue(
                    activeMaterialization
                        ? [activeMaterialization.materializationUri]
                        : [],
                ),
            getMaterializationScopeVersion: vi.fn().mockResolvedValue('1:1'),
        };
        const projectModel = {
            getExploreFromCache: vi.fn().mockResolvedValue(preAggregateExplore),
        };
        const createDuckdbWarehouseClient = vi
            .fn()
            .mockReturnValue(warehouseClientMock as unknown as WarehouseClient);

        const client = new PreAggregationDuckDbClient({
            lightdashConfig: resolvedLightdashConfig,
            preAggregateModel:
                preAggregateModel as unknown as PreAggregateModel,
            projectModel: projectModel as unknown as ProjectModel,
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
            projectModel,
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

    const makeCustomSqlDimension = (sql: string): CustomSqlDimension => ({
        id: 'custom_1',
        name: 'Custom 1',
        table: 'a',
        type: CustomDimensionType.SQL,
        sql,
        dimensionType: DimensionType.STRING,
    });

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
        const { client, preAggregateModel, projectModel } = getClient();
        preAggregateModel.getActiveMaterialization.mockResolvedValue(undefined);

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
        });
        expect(preAggregateModel.getActiveMaterialization).toHaveBeenCalledWith(
            'projectUuid',
            '__preagg__valid_explore__rollup',
        );
        expect(projectModel.getExploreFromCache).not.toHaveBeenCalled();
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
        expect(
            preAggregateModel.getActiveMaterialization,
        ).not.toHaveBeenCalled();
    });

    test('creates the pre-aggregate DuckDB client from the pre-aggregate S3 config, scoped to the project files on a per-project instance', async () => {
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
                getActiveMaterialization: vi.fn(),
                findMaterializationUrisForProject: vi
                    .fn()
                    .mockResolvedValue([
                        's3://mock_preagg_bucket/abc123.parquet',
                        's3://mock_preagg_bucket/def456.parquet',
                    ]),
                getMaterializationScopeVersion: vi
                    .fn()
                    .mockResolvedValue('2:1'),
            },
            projectModel: {
                getExploreFromCache: vi.fn(),
            },
        });

        const warehouseClient =
            await client.createPreAggregateWarehouseClient('project-a');

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
                    scope: [
                        's3://mock_preagg_bucket/abc123.parquet',
                        's3://mock_preagg_bucket/def456.parquet',
                    ],
                },
            },
            expect.objectContaining({
                instanceCacheKey: 'pre-aggregate-query-instance:project-a',
                objectStorageOnly: true,
            }),
        );
    });

    test('never shares a serve instance across projects', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();

        await client.createPreAggregateWarehouseClient('project-a');
        await client.createPreAggregateWarehouseClient('project-b');

        expect(getPreAggregateQueryInstanceCacheKey('project-a')).not.toBe(
            getPreAggregateQueryInstanceCacheKey('project-b'),
        );
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(2);
        expect(createDuckdbWarehouseClient).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                instanceCacheKey: 'pre-aggregate-query-instance:project-a',
            }),
        );
        expect(createDuckdbWarehouseClient).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                instanceCacheKey: 'pre-aggregate-query-instance:project-b',
            }),
        );
    });

    test('checks only the scope version while the project files are unchanged', async () => {
        const { client, preAggregateModel, createDuckdbWarehouseClient } =
            getClient();

        const first =
            await client.createPreAggregateWarehouseClient('project-a');
        const second =
            await client.createPreAggregateWarehouseClient('project-a');
        const third =
            await client.createPreAggregateWarehouseClient('project-a');

        expect(second).toBe(first);
        expect(third).toBe(first);
        expect(
            preAggregateModel.getMaterializationScopeVersion,
        ).toHaveBeenCalledTimes(3);
        expect(
            preAggregateModel.findMaterializationUrisForProject,
        ).toHaveBeenCalledTimes(1);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
    });

    test('re-reads the scope when a refresh promotes a new file, so the file is in scope before it is served', async () => {
        const { client, preAggregateModel, createDuckdbWarehouseClient } =
            getClient();
        await client.createPreAggregateWarehouseClient('project-a');

        // A refresh in another process promotes new789 and supersedes abc123
        preAggregateModel.getMaterializationScopeVersion.mockResolvedValue(
            '2:2',
        );
        preAggregateModel.findMaterializationUrisForProject.mockResolvedValue([
            's3://mock_preagg_bucket/abc123.jsonl',
            's3://mock_preagg_bucket/new789.parquet',
        ]);
        await client.createPreAggregateWarehouseClient('project-a');

        expect(
            preAggregateModel.findMaterializationUrisForProject,
        ).toHaveBeenCalledTimes(2);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(2);
        expect(createDuckdbWarehouseClient).toHaveBeenLastCalledWith(
            expect.objectContaining({
                s3Config: expect.objectContaining({
                    scope: [
                        's3://mock_preagg_bucket/abc123.jsonl',
                        's3://mock_preagg_bucket/new789.parquet',
                    ],
                }),
                instanceCacheKey: 'pre-aggregate-query-instance:project-a',
            }),
        );
    });

    test('keeps the client when files age out of the grace window', async () => {
        const { client, preAggregateModel, createDuckdbWarehouseClient } =
            getClient();
        preAggregateModel.findMaterializationUrisForProject.mockResolvedValue([
            's3://mock_preagg_bucket/abc123.jsonl',
            's3://mock_preagg_bucket/new789.parquet',
        ]);
        const first =
            await client.createPreAggregateWarehouseClient('project-a');

        preAggregateModel.getMaterializationScopeVersion.mockResolvedValue(
            '2:3',
        );
        preAggregateModel.findMaterializationUrisForProject.mockResolvedValue([
            's3://mock_preagg_bucket/new789.parquet',
        ]);
        const afterShrink =
            await client.createPreAggregateWarehouseClient('project-a');
        const again =
            await client.createPreAggregateWarehouseClient('project-a');

        expect(afterShrink).toBe(first);
        expect(again).toBe(first);
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
        expect(
            preAggregateModel.findMaterializationUrisForProject,
        ).toHaveBeenCalledTimes(2);
    });

    test('reads the scope with the configured grace window', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));
        try {
            const { client, preAggregateModel } = getClient({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    preAggregates: {
                        ...lightdashConfigMock.preAggregates,
                        scopeGracePeriodHours: 6,
                    },
                },
            });

            await client.createPreAggregateWarehouseClient('project-a');

            expect(
                preAggregateModel.findMaterializationUrisForProject,
            ).toHaveBeenCalledWith('project-a', {
                retainedSince: new Date('2026-11-10T06:00:00.000Z'),
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test('refuses to build a serve client for a project with no materialization files', async () => {
        const { client, preAggregateModel, createDuckdbWarehouseClient } =
            getClient();
        preAggregateModel.findMaterializationUrisForProject.mockResolvedValue(
            [],
        );

        await expect(
            client.createPreAggregateWarehouseClient('project-a'),
        ).rejects.toThrow(MissingConfigError);
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
    });

    test('serves a custom SQL dimension that only references fields', async () => {
        const { client } = getClient();

        const result = await client.resolve({
            ...baseResolveArgs,
            metricQuery: {
                ...baseResolveArgs.metricQuery,
                dimensions: ['custom_1'],
                customDimensions: [
                    makeCustomSqlDimension(
                        "CASE WHEN ${a.dim1} = 'x' THEN 'yes' ELSE 'no' END",
                    ),
                ],
            },
        });

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT * FROM test',
        });
        expect(QueryComposerMock).toHaveBeenCalledTimes(1);
    });

    test('returns resolved DuckDB query and patches pre-aggregate sqlTable', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT * FROM test',
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
        // The serve client is built at execution time, not at resolve time
        expect(createDuckdbWarehouseClient).not.toHaveBeenCalled();
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

        await client.createPreAggregateWarehouseClient('projectUuid');

        expect(createDuckdbWarehouseClient).toHaveBeenCalledWith(
            expect.objectContaining({
                sharedResourceLimits: {
                    memoryLimit: '3GB',
                },
                instanceCacheKey: 'pre-aggregate-query-instance:projectUuid',
            }),
        );
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
