import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type Account,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import { type QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { PreAggregateMaterializationService } from './PreAggregateMaterializationService';

describe('PreAggregateMaterializationService', () => {
    const preAggregateModel = {
        getPreAggregateDefinitionByUuid: jest.fn(),
        insertInProgress: jest.fn(),
        attachQueryUuid: jest.fn(),
        markFailed: jest.fn(),
        promoteToActive: jest.fn(),
        getActiveMaterialization: jest.fn(),
    };

    const queryHistoryModel = {
        pollForQueryCompletion: jest.fn(),
    };

    const asyncQueryService = {
        executeAsyncMetricQuery: jest.fn(),
    };

    const service = new PreAggregateMaterializationService({
        lightdashConfig: lightdashConfigMock,
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
        queryHistoryModel: queryHistoryModel as unknown as QueryHistoryModel,
        asyncQueryService: asyncQueryService as unknown as AsyncQueryService,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        preAggregateModel.insertInProgress.mockResolvedValue({
            materializationUuid: 'mat-1',
        });
    });

    test('marks run as failed when definition has no materialization query', async () => {
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            preAggregateDefinitionUuid: 'def-1',
            materializationMetricQuery: null,
            materializationQueryError: 'Unknown metric "orders.count"',
        });

        const result = await service.materializePreAggregate({
            account: {} as Account,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });

        expect(result).toEqual({
            materializationUuid: 'mat-1',
            status: 'failed',
        });
        expect(preAggregateModel.insertInProgress).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });
        expect(preAggregateModel.markFailed).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            errorMessage: 'Unknown metric "orders.count"',
        });
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
    });

    test('runs query and promotes active materialization for valid definition', async () => {
        const queryUpdatedAt = new Date('2024-02-01T10:00:00.000Z');
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            preAggregateDefinitionUuid: 'def-1',
            materializationMetricQuery: {
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                metricComponents: {},
            },
            materializationQueryError: null,
        });
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid: 'query-1',
        });
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: 'query-1-results',
            resultsUpdatedAt: queryUpdatedAt,
            totalRowCount: 123,
            columns: null,
        });
        preAggregateModel.promoteToActive.mockResolvedValue({
            status: 'active',
        });

        const result = await service.materializePreAggregate({
            account: {} as Account,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });

        expect(result).toEqual({
            materializationUuid: 'mat-1',
            status: 'active',
            queryUuid: 'query-1',
        });
        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-1',
                context: QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                invalidateCache: true,
            }),
        );
        expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            queryUuid: 'query-1',
            materializationUri: 's3://mock_preagg_bucket/query-1-results.jsonl',
            materializedAt: queryUpdatedAt,
            rowCount: 123,
            columns: null,
        });
    });

    test('marks run as failed when ready query has no persisted results file', async () => {
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            preAggregateDefinitionUuid: 'def-1',
            materializationMetricQuery: {
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                metricComponents: {},
            },
            materializationQueryError: null,
        });
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid: 'query-1',
        });
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: null,
            resultsUpdatedAt: new Date('2024-02-01T10:00:00.000Z'),
            totalRowCount: 123,
            columns: null,
        });

        const result = await service.materializePreAggregate({
            account: {} as Account,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });

        expect(result).toEqual({
            materializationUuid: 'mat-1',
            status: 'failed',
            queryUuid: 'query-1',
        });
        expect(preAggregateModel.markFailed).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            errorMessage:
                'Materialization query completed without a persisted results file',
        });
        expect(preAggregateModel.promoteToActive).not.toHaveBeenCalled();
    });
});
