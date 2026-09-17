import {
    Account,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import type { S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import type { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { sessionAccount } from '../../../services/ProjectService/ProjectService.mock';
import type { PreAggregateModel } from '../../models/PreAggregateModel';
import { PreAggregateMaterializationService } from './PreAggregateMaterializationService';

describe('PreAggregateMaterializationService', () => {
    const baseStoredPreAggregateDefinition = {
        preAggregateDefinition: {
            name: 'orders_rollup',
            dimensions: ['order_date'],
            metrics: ['order_count'],
        },
    };

    const preAggregateModel = {
        getPreAggregateDefinitionByUuid: vi.fn(),
        insertInProgress: vi.fn(),
        attachQueryUuid: vi.fn(),
        markFailed: vi.fn(),
        promoteToActive: vi.fn(),
        getActiveMaterialization: vi.fn(),
    };

    const queryHistoryModel = {
        pollForQueryCompletion: vi.fn(),
    };

    const asyncQueryService = {
        executeAsyncMetricQuery: vi.fn(),
    };

    const preAggregateResultsStorageClient = {
        getFileSize: vi.fn(),
    };

    const service = new PreAggregateMaterializationService({
        lightdashConfig: lightdashConfigMock,
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
        queryHistoryModel: queryHistoryModel as unknown as QueryHistoryModel,
        asyncQueryService: asyncQueryService as unknown as AsyncQueryService,
        analytics: analyticsMock,
        preAggregateResultsStorageClient:
            preAggregateResultsStorageClient as unknown as S3ResultsFileStorageClient,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(analyticsMock, 'trackAccount').mockImplementation(
            () => undefined,
        );
        preAggregateModel.insertInProgress.mockResolvedValue({
            materializationUuid: 'mat-1',
        });
    });

    test('marks run as failed when definition has no materialization query', async () => {
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            ...baseStoredPreAggregateDefinition,
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
            preAggregateDefinition: {
                ...baseStoredPreAggregateDefinition.preAggregateDefinition,
                sorts: [{ fieldId: 'orders_status', descending: false }],
            },
            preAggregateDefinitionUuid: 'def-1',
            materializationMetricQuery: {
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: [],
                    filters: {},
                    sorts: [{ fieldId: 'orders_status', descending: false }],
                    limit: 100,
                    tableCalculations: [],
                },
                metricComponents: {},
                timeDimensionFieldId: null,
                resolvedMaxRows: null,
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
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(456789);
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
                    dimensions: ['orders_status'],
                    metrics: [],
                    filters: {},
                    sorts: [{ fieldId: 'orders_status', descending: false }],
                    limit: 100,
                    tableCalculations: [],
                },
                invalidateCache: true,
            }),
        );
        expect(
            asyncQueryService.executeAsyncMetricQuery.mock.calls[0][0],
        ).not.toHaveProperty('materializationRole');
        expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            queryUuid: 'query-1',
            materializationUri: 's3://mock_preagg_bucket/query-1-results.jsonl',
            materializedAt: queryUpdatedAt,
            rowCount: 123,
            columns: null,
            totalBytes: 456789,
        });
    });

    test.each([
        {
            name: 'applies automatic sorts to stored definitions without sort config',
            preAggregateDefinition:
                baseStoredPreAggregateDefinition.preAggregateDefinition,
            expectedSorts: [
                { fieldId: 'orders_order_date_day', descending: true },
                { fieldId: 'orders_status', descending: false },
            ],
        },
        {
            name: 'preserves explicitly disabled materialization sorting',
            preAggregateDefinition: {
                ...baseStoredPreAggregateDefinition.preAggregateDefinition,
                sorts: [],
            },
            expectedSorts: [],
        },
    ])('$name', async ({ preAggregateDefinition, expectedSorts }) => {
        const queryUpdatedAt = new Date('2024-02-01T10:00:00.000Z');
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            preAggregateDefinition,
            preAggregateDefinitionUuid: 'def-1',
            materializationMetricQuery: {
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status', 'orders_order_date_day'],
                    metrics: ['orders_total_order_amount'],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                metricComponents: {},
                timeDimensionFieldId: 'orders_order_date_day',
                resolvedMaxRows: null,
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
            totalRowCount: 50,
            columns: null,
        });
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(1234);
        preAggregateModel.promoteToActive.mockResolvedValue({
            status: 'active',
        });

        await service.materializePreAggregate({
            account: {} as Account,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });

        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                metricQuery: expect.objectContaining({
                    sorts: expectedSorts,
                }),
            }),
        );
    });

    test('marks run as failed when ready query has no persisted results file', async () => {
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            ...baseStoredPreAggregateDefinition,
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
                timeDimensionFieldId: null,
                resolvedMaxRows: null,
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

    describe('maxRows promote gate', () => {
        const definitionWithMaxRows = (resolvedMaxRows: number | null) => ({
            ...baseStoredPreAggregateDefinition,
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
                timeDimensionFieldId: null,
                resolvedMaxRows,
            },
            materializationQueryError: null,
        });

        const readyQueryHistory = (totalRowCount: number | null) => ({
            status: QueryHistoryStatus.READY,
            resultsFileName: 'query-1-results',
            resultsUpdatedAt: new Date('2024-02-01T10:00:00.000Z'),
            totalRowCount,
            columns: null,
        });

        beforeEach(() => {
            asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
                queryUuid: 'query-1',
            });
            preAggregateResultsStorageClient.getFileSize.mockResolvedValue(
                456789,
            );
            preAggregateModel.promoteToActive.mockResolvedValue({
                status: 'active',
            });
        });

        test('marks run as failed without promoting when the row count reaches the persisted cap', async () => {
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                definitionWithMaxRows(100),
            );
            queryHistoryModel.pollForQueryCompletion.mockResolvedValue(
                readyQueryHistory(100),
            );

            const result = await service.materializePreAggregate({
                account: sessionAccount,
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
                    'Materialization reached the maxRows limit of 100 rows and would serve truncated results. Raise max_rows, add pre-aggregate filters, or coarsen the grain.',
            });
            // The gate runs before promotion, so the previous active materialization keeps serving.
            expect(preAggregateModel.promoteToActive).not.toHaveBeenCalled();
        });

        test('promotes when the row count is strictly below the persisted cap', async () => {
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                definitionWithMaxRows(100),
            );
            queryHistoryModel.pollForQueryCompletion.mockResolvedValue(
                readyQueryHistory(99),
            );

            const result = await service.materializePreAggregate({
                account: sessionAccount,
                projectUuid: 'project-1',
                preAggregateDefinitionUuid: 'def-1',
                trigger: 'manual',
            });

            expect(result).toEqual({
                materializationUuid: 'mat-1',
                status: 'active',
                queryUuid: 'query-1',
            });
            expect(preAggregateModel.markFailed).not.toHaveBeenCalled();
            expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith(
                expect.objectContaining({ rowCount: 99 }),
            );
        });

        test('promotes when the warehouse omits the row count', async () => {
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                definitionWithMaxRows(100),
            );
            queryHistoryModel.pollForQueryCompletion.mockResolvedValue(
                readyQueryHistory(null),
            );

            const result = await service.materializePreAggregate({
                account: sessionAccount,
                projectUuid: 'project-1',
                preAggregateDefinitionUuid: 'def-1',
                trigger: 'manual',
            });

            expect(result).toEqual({
                materializationUuid: 'mat-1',
                status: 'active',
                queryUuid: 'query-1',
            });
            expect(preAggregateModel.markFailed).not.toHaveBeenCalled();
            expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith(
                expect.objectContaining({ rowCount: null }),
            );
        });
    });

    test('passes materializationRole only when the pre-aggregate definition configures it', async () => {
        const queryUpdatedAt = new Date('2024-02-01T10:00:00.000Z');
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            preAggregateDefinitionUuid: 'def-1',
            preAggregateDefinition: {
                ...baseStoredPreAggregateDefinition.preAggregateDefinition,
                materializationRole: {
                    email: 'materialize@acme.com',
                    attributes: {
                        allowed_regions: ['EMEA', 'APAC'],
                        is_admin: ['true'],
                    },
                },
            },
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
                timeDimensionFieldId: null,
                resolvedMaxRows: null,
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
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(456789);
        preAggregateModel.promoteToActive.mockResolvedValue({
            status: 'active',
        });

        await service.materializePreAggregate({
            account: {} as Account,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
        });

        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                materializationRole: {
                    intrinsicUserAttributes: {
                        email: 'materialize@acme.com',
                    },
                    userAttributes: {
                        allowed_regions: ['EMEA', 'APAC'],
                        is_admin: ['true'],
                    },
                },
            }),
        );
    });
});
