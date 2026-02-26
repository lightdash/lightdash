import { DimensionType, type WarehouseClient } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { ProjectService } from '../ProjectService/ProjectService';
import {
    metricQueryMock,
    preAggregateExplore,
} from '../ProjectService/ProjectService.mock';
import { PreAggregationDuckDbClient } from './PreAggregationDuckDbClient';

describe('PreAggregationDuckDbClient', () => {
    const getClient = ({
        lightdashConfig,
        activeMaterialization = {
            materializationUuid: 'mat-1',
            queryUuid: 'mat-query-1',
            resultsFileName: 'abc123',
            format: 'jsonl' as const,
            columns: null,
            materializedAt: new Date('2024-01-01T00:00:00.000Z'),
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
            getActiveMaterialization: jest
                .fn()
                .mockResolvedValue(activeMaterialization),
        };
        const projectModel = {
            getExploreFromCache: jest
                .fn()
                .mockResolvedValue(preAggregateExplore),
        };
        const createDuckdbWarehouseClient = jest
            .fn()
            .mockReturnValue(warehouseClientMock as unknown as WarehouseClient);

        const client = new PreAggregationDuckDbClient({
            lightdashConfig: resolvedLightdashConfig,
            preAggregateModel:
                preAggregateModel as unknown as PreAggregateModel,
            projectModel: projectModel as unknown as ProjectModel,
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
        dateZoom: undefined,
        parameters: { region: 'us-east' },
        preAggregationRoute: {
            sourceExploreName: 'valid_explore',
            preAggregateName: 'rollup',
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
        jest.clearAllMocks();
        jest.spyOn(ProjectService, '_compileQuery').mockResolvedValue({
            query: 'SELECT * FROM test',
        } as unknown as Awaited<
            ReturnType<typeof ProjectService._compileQuery>
        >);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns unresolved when no active materialization exists', async () => {
        const { client, preAggregateModel, projectModel } = getClient();
        preAggregateModel.getActiveMaterialization.mockResolvedValue(undefined);

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: 'no_active_materialization',
        });
        expect(preAggregateModel.getActiveMaterialization).toHaveBeenCalledWith(
            'projectUuid',
            '__preagg__valid_explore__rollup',
        );
        expect(projectModel.getExploreFromCache).not.toHaveBeenCalled();
    });

    test('returns unresolved when results S3 bucket config is missing', async () => {
        const { client, preAggregateModel } = getClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
                results: {
                    ...lightdashConfigMock.results,
                    s3: undefined,
                },
            },
        });

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: 'missing_results_s3_bucket',
        });
        expect(
            preAggregateModel.getActiveMaterialization,
        ).not.toHaveBeenCalled();
    });

    test('returns resolved DuckDB query/client and patches pre-aggregate sqlTable', async () => {
        const { client, createDuckdbWarehouseClient } = getClient();

        const result = await client.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT * FROM test',
            warehouseClient: warehouseClientMock,
        });
        expect(ProjectService._compileQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                explore: expect.objectContaining({
                    name: '__preagg__valid_explore__rollup',
                    tables: expect.objectContaining({
                        a: expect.objectContaining({
                            sqlTable:
                                "read_json_auto('s3://mock_bucket/abc123.jsonl')",
                        }),
                        b: expect.objectContaining({
                            sqlTable:
                                "read_json_auto('s3://mock_bucket/abc123.jsonl')",
                        }),
                    }),
                }),
            }),
        );
        expect(createDuckdbWarehouseClient).toHaveBeenCalledTimes(1);
    });

    test('uses active materialization columns as DuckDB JSON schema when available', async () => {
        const { client } = getClient({
            activeMaterialization: {
                materializationUuid: 'mat-1',
                queryUuid: 'mat-query-1',
                resultsFileName: 'abc123',
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
            },
        });

        await client.resolve(baseResolveArgs);

        expect(ProjectService._compileQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                explore: expect.objectContaining({
                    tables: expect.objectContaining({
                        a: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_bucket/abc123.jsonl', columns={"a_dim1": 'VARCHAR', "a_met_count": 'DOUBLE', "a_created_at": 'TIMESTAMP'}, format='newline_delimited')`,
                        }),
                        b: expect.objectContaining({
                            sqlTable: `read_json('s3://mock_bucket/abc123.jsonl', columns={"a_dim1": 'VARCHAR', "a_met_count": 'DOUBLE', "a_created_at": 'TIMESTAMP'}, format='newline_delimited')`,
                        }),
                    }),
                }),
            }),
        );
    });
});
