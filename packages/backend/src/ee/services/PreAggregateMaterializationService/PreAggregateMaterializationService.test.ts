import {
    QueryHistoryStatus,
    type ActiveMaterializationDetails,
    type PreAggregateDefinition,
    type PreAggregateMaterializationTrigger,
} from '@lightdash/common';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import type { S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import type { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { sessionAccount } from '../../../services/ProjectService/ProjectService.mock';
import type { PreAggregateModel } from '../../models/PreAggregateModel';
import { PreAggregateMaterializationService } from './PreAggregateMaterializationService';

const evaluatedAt = new Date('2026-09-14T10:00:00.000Z');
const definition: PreAggregateDefinition = {
    preAggregateDefinitionUuid: 'def-1',
    projectUuid: 'project-1',
    sourceCachedExploreUuid: 'source',
    preAggCachedExploreUuid: 'generated',
    sourceExploreName: 'orders',
    preAggregateName: 'daily_orders',
    publicationVersion: 'publication-1',
    compatibilityHash: 'hash-1',
    scheduleRevision: 'schedule-1',
    schedulerTimezone: 'UTC',
    preparationStatus: 'ready',
    automaticEligible: true,
    physicalOutputContract: { columns: [], grain: [], format: 'jsonl' },
    preAggregateDefinition: {
        name: 'daily_orders',
        dimensions: ['status'],
        metrics: [],
    },
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
    refreshCron: null,
    createdAt: evaluatedAt,
    updatedAt: evaluatedAt,
};

const active: ActiveMaterializationDetails = {
    materializationUuid: 'active-1',
    queryUuid: 'old-query',
    materializationUri: 's3://mock_preagg_bucket/old-results.jsonl',
    format: 'jsonl',
    columns: null,
    materializedAt: evaluatedAt,
    totalBytes: 100,
    publicationVersion: 'publication-1',
    compatibilityHash: 'hash-1',
    evaluatedAt,
    physicalOutputContract: definition.physicalOutputContract,
    pinnedContextHash: 'context-1',
};

const prepared = {
    queryComposer: { getExplore: () => ({ name: 'orders' }) },
    compatibilityHash: 'hash-1',
    physicalOutputContract: definition.physicalOutputContract,
    pinnedContextHash: 'context-1',
    evaluatedAt,
    materializationMetricQuery: definition.materializationMetricQuery,
};

describe('PreAggregateMaterializationService', () => {
    const preAggregateModel = {
        getPreAggregateDefinitionByUuid: vi.fn(),
        getReuseState: vi.fn(),
        isLegacyDefinitionAutomaticallyEligible: vi.fn(),
        refreshDesiredPreparation: vi.fn(),
        insertInProgress: vi.fn(),
        attachQueryUuid: vi.fn(),
        markFailed: vi.fn(),
        promoteToActive: vi.fn(),
        getActiveMaterialization: vi.fn(),
    };
    const queryHistoryModel = { pollForQueryCompletion: vi.fn() };
    const asyncQueryService = {
        prepareRegisteredPreAggregate: vi.fn(),
        executePreAggregateMaterialization: vi.fn(),
    };
    const preAggregateResultsStorageClient = { getFileSize: vi.fn() };
    const service = new PreAggregateMaterializationService({
        lightdashConfig: lightdashConfigMock,
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
        queryHistoryModel: queryHistoryModel as unknown as QueryHistoryModel,
        asyncQueryService: asyncQueryService as unknown as AsyncQueryService,
        analytics: analyticsMock,
        preAggregateResultsStorageClient:
            preAggregateResultsStorageClient as unknown as S3ResultsFileStorageClient,
    });
    const materialize = (
        trigger: PreAggregateMaterializationTrigger = 'compile',
        scheduleRevision?: string,
    ) =>
        service.materializePreAggregate({
            account: sessionAccount,
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger,
            ...(scheduleRevision && { scheduleRevision }),
        });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(analyticsMock, 'trackAccount').mockImplementation(
            () => undefined,
        );
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
            definition,
        );
        preAggregateModel.getReuseState.mockResolvedValue({
            phase: 'active',
            reuseEnabled: true,
        });
        preAggregateModel.isLegacyDefinitionAutomaticallyEligible.mockResolvedValue(
            false,
        );
        preAggregateModel.refreshDesiredPreparation.mockResolvedValue(
            definition,
        );
        preAggregateModel.insertInProgress.mockResolvedValue({
            materializationUuid: 'mat-1',
        });
        preAggregateModel.promoteToActive.mockResolvedValue({
            status: 'active',
        });
        asyncQueryService.prepareRegisteredPreAggregate.mockResolvedValue(
            prepared,
        );
        asyncQueryService.executePreAggregateMaterialization.mockResolvedValue({
            queryUuid: 'query-1',
        });
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: 'query-1-results',
            resultsUpdatedAt: evaluatedAt,
            totalRowCount: 123,
            columns: {},
        });
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(456789);
    });

    test('rejects output with an incompatible physical schema before promotion', async () => {
        asyncQueryService.prepareRegisteredPreAggregate.mockResolvedValue({
            ...prepared,
            physicalOutputContract: {
                ...prepared.physicalOutputContract,
                columns: [{ name: 'expected_amount', type: 'number' }],
            },
        });
        expect((await materialize('manual')).status).toBe('failed');
        expect(preAggregateModel.promoteToActive).not.toHaveBeenCalled();
        expect(preAggregateModel.markFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                errorMessage:
                    'Materialization output does not match its prepared column contract',
            }),
        );
    });

    test('rejects output that was not persisted to storage', async () => {
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(null);
        expect((await materialize('manual')).status).toBe('failed');
        expect(preAggregateModel.promoteToActive).not.toHaveBeenCalled();
    });

    test('preserves a typed empty materialization', async () => {
        asyncQueryService.prepareRegisteredPreAggregate.mockResolvedValue({
            ...prepared,
            physicalOutputContract: {
                ...prepared.physicalOutputContract,
                columns: [{ name: 'amount', type: 'number' }],
            },
        });
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: 'empty-results',
            resultsUpdatedAt: evaluatedAt,
            totalRowCount: 0,
            columns: null,
        });
        preAggregateResultsStorageClient.getFileSize.mockResolvedValue(0);
        expect((await materialize('manual')).status).toBe('active');
        expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith(
            expect.objectContaining({
                columns: { amount: { reference: 'amount', type: 'number' } },
                totalBytes: 0,
            }),
        );
    });

    test.each([null, '0 10 * * *'])(
        'skips unchanged compile with usable active and cron %s',
        async (refreshCron) => {
            const currentDefinition = { ...definition, refreshCron };
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                currentDefinition,
            );
            preAggregateModel.refreshDesiredPreparation.mockResolvedValue(
                currentDefinition,
            );
            preAggregateModel.getActiveMaterialization.mockResolvedValue(
                active,
            );

            await expect(materialize()).resolves.toEqual({
                status: 'skipped',
                reason: 'unchanged_active',
            });

            expect(
                preAggregateResultsStorageClient.getFileSize,
            ).toHaveBeenCalledWith('old-results.jsonl', 'jsonl');
            expect(preAggregateModel.insertInProgress).not.toHaveBeenCalled();
            expect(
                asyncQueryService.executePreAggregateMaterialization,
            ).not.toHaveBeenCalled();
            expect(
                queryHistoryModel.pollForQueryCompletion,
            ).not.toHaveBeenCalled();
            expect(analyticsMock.trackAccount).not.toHaveBeenCalled();
        },
    );

    test('retains an older usable active materialization after a later failed attempt', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue({
            ...active,
            materializationUuid: 'older-success',
        });

        await expect(materialize()).resolves.toEqual({
            status: 'skipped',
            reason: 'unchanged_active',
        });
        expect(preAggregateModel.getActiveMaterialization).toHaveBeenCalledWith(
            'project-1',
            '__preagg__orders__daily_orders',
        );
        expect(preAggregateModel.insertInProgress).not.toHaveBeenCalled();
        expect(preAggregateModel.markFailed).not.toHaveBeenCalled();
    });

    test.each([
        { name: 'missing active materialization', active: undefined },
        {
            name: 'unknown legacy hash',
            active: { ...active, compatibilityHash: null },
        },
        {
            name: 'incompatible active hash',
            active: { ...active, compatibilityHash: 'older-hash' },
        },
    ])(
        'materializes a baseline for $name',
        async ({ active: currentActive }) => {
            preAggregateModel.getActiveMaterialization.mockResolvedValue(
                currentActive,
            );

            await expect(materialize()).resolves.toEqual({
                materializationUuid: 'mat-1',
                status: 'active',
                queryUuid: 'query-1',
            });
            expect(preAggregateModel.insertInProgress).toHaveBeenCalledOnce();
            expect(
                asyncQueryService.executePreAggregateMaterialization,
            ).toHaveBeenCalledWith({
                account: sessionAccount,
                projectUuid: 'project-1',
                prepared,
                materializationUuid: 'mat-1',
            });
        },
    );

    test('materializes conservatively when the desired fingerprint is unverifiable', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        asyncQueryService.prepareRegisteredPreAggregate.mockResolvedValue({
            ...prepared,
            compatibilityHash: null,
        });

        await expect(materialize()).resolves.toMatchObject({
            status: 'active',
        });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test('materializes again when the matching active object is missing', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        preAggregateResultsStorageClient.getFileSize.mockResolvedValueOnce(
            null,
        );

        await expect(materialize()).resolves.toMatchObject({
            status: 'active',
        });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test('repairs an unreadable active object instead of failing before materialization', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        preAggregateResultsStorageClient.getFileSize.mockRejectedValueOnce(
            new Error('Object storage probe failed'),
        );

        await expect(materialize()).resolves.toMatchObject({
            status: 'active',
        });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test.each(['not-a-uri', 's3://different-bucket/old-results'])(
        'repairs an active materialization with an unusable storage URI %s',
        async (materializationUri) => {
            preAggregateModel.getActiveMaterialization.mockResolvedValue({
                ...active,
                materializationUri,
            });

            await expect(materialize()).resolves.toMatchObject({
                status: 'active',
            });
            expect(
                asyncQueryService.executePreAggregateMaterialization,
            ).toHaveBeenCalledOnce();
        },
    );

    test('retains eager compile materialization in compatibility rollout phase', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        preAggregateModel.getReuseState.mockResolvedValue({
            phase: 'compatibility',
            reuseEnabled: false,
        });

        await expect(materialize()).resolves.toMatchObject({
            status: 'active',
        });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test('restores eager compile materialization with reuse disabled after activation', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        preAggregateModel.getReuseState.mockResolvedValue({
            phase: 'active',
            reuseEnabled: false,
        });

        await expect(materialize()).resolves.toMatchObject({
            status: 'active',
        });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test.each<PreAggregateMaterializationTrigger>(['compile', 'cron'])(
        'builds old-writer definitions for %s during compatibility',
        async (trigger) => {
            const legacyDefinition = {
                ...definition,
                sourceExploreName: null,
                preAggregateName: null,
                automaticEligible: false,
            };
            preAggregateModel.getReuseState.mockResolvedValue({
                phase: 'compatibility',
                reuseEnabled: false,
            });
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                legacyDefinition,
            );
            preAggregateModel.refreshDesiredPreparation.mockResolvedValue(
                legacyDefinition,
            );
            preAggregateModel.isLegacyDefinitionAutomaticallyEligible.mockResolvedValue(
                true,
            );

            await expect(materialize(trigger)).resolves.toMatchObject({
                status: 'active',
            });
            expect(
                asyncQueryService.executePreAggregateMaterialization,
            ).toHaveBeenCalledOnce();
            // Repairing compiler provenance must not rotate an otherwise valid
            // legacy schedule merely because its new eligibility flag defaulted.
            expect(
                preAggregateModel.refreshDesiredPreparation,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ automaticEligible: false }),
            );
        },
    );

    test('accepts revisionless legacy cron only during compatibility, preserving supplied revision checks', async () => {
        preAggregateModel.getReuseState.mockResolvedValue({
            phase: 'compatibility',
            reuseEnabled: false,
        });
        await expect(materialize('cron')).resolves.toMatchObject({
            status: 'active',
        });
        expect(preAggregateModel.insertInProgress).toHaveBeenCalledWith(
            expect.objectContaining({ expectedScheduleRevision: undefined }),
        );
        await expect(materialize('cron', 'obsolete-revision')).resolves.toEqual(
            {
                status: 'skipped',
                reason: 'obsolete_schedule',
            },
        );
    });

    test('does not use legacy eligibility inference after activation', async () => {
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue({
            ...definition,
            sourceExploreName: null,
            preAggregateName: null,
            automaticEligible: false,
        });
        preAggregateModel.isLegacyDefinitionAutomaticallyEligible.mockResolvedValue(
            true,
        );
        await expect(materialize()).resolves.toEqual({
            status: 'skipped',
            reason: 'ineligible',
        });
        expect(
            preAggregateModel.isLegacyDefinitionAutomaticallyEligible,
        ).not.toHaveBeenCalled();
    });

    test.each<PreAggregateMaterializationTrigger>([
        'manual',
        'cron',
        'webhook',
    ])('forces %s refresh even with matching active', async (trigger) => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);

        await expect(
            materialize(trigger, trigger === 'cron' ? 'schedule-1' : undefined),
        ).resolves.toMatchObject({ status: 'active' });
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).toHaveBeenCalledOnce();
    });

    test.each([undefined, 'obsolete-revision'])(
        'skips obsolete cron revision %s before query preparation',
        async (scheduleRevision) => {
            await expect(
                materialize('cron', scheduleRevision),
            ).resolves.toEqual({
                status: 'skipped',
                reason: 'obsolete_schedule',
            });
            expect(
                asyncQueryService.prepareRegisteredPreAggregate,
            ).not.toHaveBeenCalled();
            expect(preAggregateModel.insertInProgress).not.toHaveBeenCalled();
        },
    );

    test.each([
        { ...definition, automaticEligible: false },
        { ...definition, materializationMetricQuery: null },
        { ...definition, materializationQueryError: 'Unknown metric' },
    ])(
        'skips ineligible automatic definitions without querying',
        async (currentDefinition) => {
            preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
                currentDefinition,
            );

            await expect(materialize()).resolves.toEqual({
                status: 'skipped',
                reason: 'ineligible',
            });
            expect(
                asyncQueryService.prepareRegisteredPreAggregate,
            ).not.toHaveBeenCalled();
            expect(preAggregateModel.insertInProgress).not.toHaveBeenCalled();
        },
    );

    test('does not execute a preparation when the publication changes while preparing it', async () => {
        preAggregateModel.refreshDesiredPreparation.mockResolvedValue(
            undefined,
        );

        await expect(materialize()).rejects.toThrow(
            'Pre-aggregate changed during preparation',
        );
        expect(preAggregateModel.insertInProgress).not.toHaveBeenCalled();
        expect(
            asyncQueryService.executePreAggregateMaterialization,
        ).not.toHaveBeenCalled();
    });

    test('persists provenance before executing the prepared query and promotes its stored result', async () => {
        await expect(materialize('manual')).resolves.toEqual({
            materializationUuid: 'mat-1',
            status: 'active',
            queryUuid: 'query-1',
        });

        expect(preAggregateModel.insertInProgress).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            preAggregateDefinitionUuid: 'def-1',
            trigger: 'manual',
            provenance: {
                publicationVersion: 'publication-1',
                compatibilityHash: 'hash-1',
                evaluatedAt,
                physicalOutputContract: definition.physicalOutputContract,
                pinnedContextHash: 'context-1',
            },
        });
        expect(
            preAggregateModel.insertInProgress.mock.invocationCallOrder[0],
        ).toBeLessThan(
            asyncQueryService.executePreAggregateMaterialization.mock
                .invocationCallOrder[0],
        );
        expect(preAggregateModel.promoteToActive).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            queryUuid: 'query-1',
            materializationUri: 's3://mock_preagg_bucket/query-1-results.jsonl',
            materializedAt: evaluatedAt,
            rowCount: 123,
            columns: {},
            totalBytes: 456789,
        });
    });

    test('passes sorting and materialization role configuration to shared preparation unchanged', async () => {
        const currentDefinition = {
            ...definition,
            preAggregateDefinition: {
                ...definition.preAggregateDefinition,
                sorts: [],
                materializationRole: {
                    email: 'materialize@example.com',
                    attributes: { region: ['EMEA'] },
                },
            },
        };
        preAggregateModel.getPreAggregateDefinitionByUuid.mockResolvedValue(
            currentDefinition,
        );
        preAggregateModel.refreshDesiredPreparation.mockResolvedValue(
            currentDefinition,
        );

        await materialize('manual');

        expect(
            asyncQueryService.prepareRegisteredPreAggregate,
        ).toHaveBeenCalledWith({
            account: sessionAccount,
            projectUuid: 'project-1',
            definition: currentDefinition,
            evaluatedAt: expect.any(Date),
        });
    });

    test('marks an attempt failed when ready query has no persisted results file', async () => {
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: null,
        });

        await expect(materialize('manual')).resolves.toEqual({
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

    test('marks a failed warehouse query without replacing the active materialization', async () => {
        preAggregateModel.getActiveMaterialization.mockResolvedValue(active);
        queryHistoryModel.pollForQueryCompletion.mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            error: 'Warehouse unavailable',
        });

        await expect(materialize('manual')).resolves.toEqual({
            materializationUuid: 'mat-1',
            status: 'failed',
            queryUuid: 'query-1',
        });
        expect(preAggregateModel.markFailed).toHaveBeenCalledWith({
            materializationUuid: 'mat-1',
            errorMessage: 'Warehouse unavailable',
        });
        expect(preAggregateModel.promoteToActive).not.toHaveBeenCalled();
    });
});
