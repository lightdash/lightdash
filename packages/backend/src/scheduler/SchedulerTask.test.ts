import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ChartType,
    DashboardTileTypes,
    DimensionType,
    DownloadFileType,
    FieldReferenceError,
    FieldType,
    FilterOperator,
    ForbiddenError,
    GoogleSheetsQuotaError,
    GoogleSheetsTransientError,
    InvalidUser,
    LightdashPage,
    MAX_DELIVERY_QUERIES,
    MetricType,
    NotEnoughResults,
    PartialFailureType,
    PersistentDownloadFileAccessMode,
    QueryHistoryStatus,
    RequestMethod,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerResourceType,
    sleep,
    ThresholdOperator,
    UnexpectedGoogleSheetsError,
    VizAggregationOptions,
    VizIndexType,
    type CapturedQuery,
    type CompileProjectPayload,
    type CreateSchedulerAndTargets,
    type DashboardParameters,
    type DeliveryCaptureManifest,
    type EmailNotificationPayload,
    type ExportContentPayload,
    type Filters,
    type GsheetsNotificationPayload,
    type LearnSandboxCommandPayload,
    type MetricQuery,
    type NotificationPayloadBase,
    type ParametersValuesMap,
    type ReadyQueryResultsPage,
    type ScheduledDeliveryPayload,
    type SchedulerAndTargets,
    type SendNowScheduler,
    type UploadGsheetPayload,
} from '@lightdash/common';
import ExecutionContext from 'node-execution-context';
import type { Mock } from 'vitest';
import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import { fromSession } from '../auth/account';
import { managedExecutionFixture } from '../auth/agentConnectionGrants/managedExecution.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { PreAggregateMaterializationService } from '../ee/services/PreAggregateMaterializationService/PreAggregateMaterializationService';
import type { ExecutionContextInfo } from '../logging/winston';
import { AGENT_SUMMARY_REFUSED_MESSAGE } from '../services/AgentPermissionService/agentWorkAuthority';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../services/AiAccessService/agentExecutionContext';
import { WorkbookExportHelper } from '../services/ExcelService/WorkbookExportHelper';
import { user as projectUser } from '../services/ProjectService/ProjectService.mock';
import { SchedulerDeliveryError } from './SchedulerDeliveryError';
import SchedulerTask, {
    buildItemMapFromColumns,
    buildSchedulerLogContext,
    computeGsheetsPacingDelayMs,
    dedupeArtifactFilename,
    GSHEET_UPLOAD_MAX_ATTEMPTS,
    GSHEET_UPLOAD_QUOTA_BRIDGE_SCHEDULE_MS,
    GSHEETS_WRITES_PER_APP_ITEM,
    GSHEETS_WRITES_PER_MINUTE_BUDGET,
    processSequentiallyWithPacing,
    retryTransientGoogleSheetsWrite,
    setSchedulerJobLogContext,
} from './SchedulerTask';
import {
    resultsWithOneRow,
    resultsWithTwoDecreasingRows,
    resultsWithTwoIncreasingRows,
    thresholdIncreasedByMock,
    thresholdLessThanMock,
} from './SchedulerTask.mock';

vi.mock('@lightdash/common', async () => ({
    ...(await vi.importActual<typeof import('@lightdash/common')>(
        '@lightdash/common',
    )),
    // Skip real backoff delays so the retry loop runs instantly.
    sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('buildSchedulerLogContext', () => {
    it('returns null when no attribution fields are set', () => {
        expect(buildSchedulerLogContext({})).toBeNull();
    });

    it('returns null when only nullish values are passed', () => {
        expect(
            buildSchedulerLogContext({
                jobId: undefined,
                savedSqlUuid: null,
            }),
        ).toBeNull();
    });

    it('includes only populated fields', () => {
        expect(
            buildSchedulerLogContext({
                jobId: 'job-1',
                schedulerUuid: 'sched-1',
            }),
        ).toEqual({
            job_id: 'job-1',
            scheduler_uuid: 'sched-1',
        });
    });

    it('stringifies a jobId that arrives as a BigInt at runtime', () => {
        expect(
            buildSchedulerLogContext({
                jobId: BigInt(4482031),
            }),
        ).toEqual({ job_id: '4482031' });
    });

    it('omits a null savedSqlUuid', () => {
        expect(
            buildSchedulerLogContext({
                jobId: 'job-1',
                savedSqlUuid: null,
            }),
        ).toEqual({ job_id: 'job-1' });
    });
});

describe('setSchedulerJobLogContext', () => {
    it('skips the updater entirely when no attribution fields are set', () => {
        const update = vi.fn();
        setSchedulerJobLogContext({}, update);
        expect(update).not.toHaveBeenCalled();
    });

    it('writes through the default ExecutionContext updater', () => {
        const initial: ExecutionContextInfo = {};
        ExecutionContext.run(() => {
            setSchedulerJobLogContext({
                jobId: 'job-42',
                schedulerUuid: 'sched-42',
                schedulerName: 'Weekly sync',
            });
            const ctx = ExecutionContext.get<ExecutionContextInfo>();
            expect(ctx.scheduler).toEqual({
                job_id: 'job-42',
                scheduler_uuid: 'sched-42',
                scheduler_name: 'Weekly sync',
            });
        }, initial);
    });

    it('is a no-op when called outside an ExecutionContext', () => {
        expect(ExecutionContext.exists()).toBe(false);
        expect(() =>
            setSchedulerJobLogContext({ jobId: 'job-1' }),
        ).not.toThrow();
    });
});

describe('isPositiveThresholdAlert', () => {
    it('should return false if there are no results or no thresholds', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert([thresholdLessThanMock], []),
        ).toBe(false);

        expect(
            SchedulerTask.isPositiveThresholdAlert([], resultsWithOneRow),
        ).toBe(false);
    });
    it('should throw error if operation requires second row but there isnt one', () => {
        expect(() =>
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdIncreasedByMock],
                resultsWithOneRow,
            ),
        ).toThrowError(NotEnoughResults);
    });
    it('should return true if condition match', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdLessThanMock],
                resultsWithOneRow,
            ),
        ).toBe(true);
    });

    it('should test threshold INCREASED_BY', () => {
        const increasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.INCREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(false);
        });

        // Test decrease

        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.05),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.8),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
    });
    it('should test threshold DECREASED_BY', () => {
        const decreasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.DECREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(false);
        });
    });
});

describe('evaluateThreshold', () => {
    it('should return diagnostic fields when GREATER_THAN is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 50,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when GREATER_THAN is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 200,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 200,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when LESS_THAN is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.LESS_THAN,
                    fieldId: 'm',
                    value: 200,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.LESS_THAN,
            thresholdValue: 200,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when LESS_THAN is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.LESS_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.LESS_THAN,
            thresholdValue: 50,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return previous values when INCREASED_BY is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.INCREASED_BY,
                    fieldId: 'm',
                    value: 10,
                },
            ],
            [{ m: 120 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.INCREASED_BY,
            thresholdValue: 10,
            rowCount: 2,
            evaluatedRawValue: 120,
            evaluatedParsedValue: 120,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when INCREASED_BY is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.INCREASED_BY,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 120 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.INCREASED_BY,
            thresholdValue: 50,
            rowCount: 2,
            evaluatedRawValue: 120,
            evaluatedParsedValue: 120,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when DECREASED_BY is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.DECREASED_BY,
                    fieldId: 'm',
                    value: 10,
                },
            ],
            [{ m: 50 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.DECREASED_BY,
            thresholdValue: 10,
            rowCount: 2,
            evaluatedRawValue: 50,
            evaluatedParsedValue: 50,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when DECREASED_BY is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.DECREASED_BY,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 90 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.DECREASED_BY,
            thresholdValue: 50,
            rowCount: 2,
            evaluatedRawValue: 90,
            evaluatedParsedValue: 90,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return diagnostic fields when results are empty', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 50,
            rowCount: 0,
            evaluatedRawValue: undefined,
            evaluatedParsedValue: null,
        });
    });

    it('should return null diagnostic fields when thresholds are empty', () => {
        const result = SchedulerTask.evaluateThreshold([], [{ m: 100 }]);
        expect(result).toMatchObject({
            met: false,
            fieldId: null,
            operator: null,
            thresholdValue: null,
            rowCount: 1,
            evaluatedRawValue: undefined,
            evaluatedParsedValue: null,
        });
    });

    it('should throw NotEnoughResults when INCREASED_BY has only one row', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.INCREASED_BY,
                        fieldId: 'm',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(NotEnoughResults);
    });

    it('should throw NotEnoughResults when DECREASED_BY has only one row', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.DECREASED_BY,
                        fieldId: 'm',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(NotEnoughResults);
    });

    it('should throw FieldReferenceError when fieldId is unknown', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.GREATER_THAN,
                        fieldId: 'unknown',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(FieldReferenceError);
    });
});

describe('retryTransientGoogleSheetsWrite', () => {
    it('writes once and resolves when the upload succeeds', async () => {
        const write = vi.fn().mockResolvedValue(undefined);

        await retryTransientGoogleSheetsWrite(write);

        expect(write).toHaveBeenCalledTimes(1);
    });

    it('retries a transient Google error and succeeds without re-running the query', async () => {
        const write = vi
            .fn()
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockResolvedValueOnce(undefined);

        await retryTransientGoogleSheetsWrite(write);

        // The query is not part of `write` — only the upload step retries.
        expect(write).toHaveBeenCalledTimes(2);
    });

    it('gives up after the max attempts when the transient error persists', async () => {
        const write = vi.fn().mockRejectedValue(new GoogleSheetsQuotaError());

        await expect(retryTransientGoogleSheetsWrite(write)).rejects.toThrow(
            GoogleSheetsQuotaError,
        );
        expect(write).toHaveBeenCalledTimes(GSHEET_UPLOAD_MAX_ATTEMPTS);
    });

    it('does not retry a non-transient error', async () => {
        const write = vi
            .fn()
            .mockRejectedValue(new ForbiddenError('no access'));

        await expect(retryTransientGoogleSheetsWrite(write)).rejects.toThrow(
            ForbiddenError,
        );
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('reports each upcoming retry attempt via onRetry', async () => {
        const write = vi
            .fn()
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockResolvedValueOnce(undefined);
        const onRetry = vi.fn().mockResolvedValue(undefined);

        await retryTransientGoogleSheetsWrite(write, onRetry);

        expect(onRetry.mock.calls).toEqual([[2], [3]]);
    });

    it('honors a Retry-After hint on a quota error instead of the default linear backoff', async () => {
        vi.mocked(sleep).mockClear();
        const write = vi
            .fn()
            .mockRejectedValueOnce(
                new GoogleSheetsQuotaError('quota', { retryAfterMs: 5000 }),
            )
            .mockResolvedValueOnce(undefined);

        await retryTransientGoogleSheetsWrite(write);

        expect(vi.mocked(sleep)).toHaveBeenCalledWith(5000);
    });

    it('caps an honored Retry-After so one huge value cannot stall the job', async () => {
        vi.mocked(sleep).mockClear();
        const write = vi
            .fn()
            .mockRejectedValueOnce(
                new GoogleSheetsQuotaError('quota', { retryAfterMs: 600000 }),
            )
            .mockResolvedValueOnce(undefined);

        await retryTransientGoogleSheetsWrite(write);

        expect(vi.mocked(sleep)).toHaveBeenCalledWith(30000);
    });

    it('falls back to the default linear backoff when the quota error carries no Retry-After', async () => {
        vi.mocked(sleep).mockClear();
        const write = vi
            .fn()
            .mockRejectedValueOnce(new GoogleSheetsQuotaError())
            .mockResolvedValueOnce(undefined);

        await retryTransientGoogleSheetsWrite(write);

        expect(vi.mocked(sleep)).toHaveBeenCalledWith(2000);
    });

    // The app branch's background syncs have nobody watching, unlike the
    // interactive ad-hoc export flow (default schedule) — they can afford to
    // wait out a full quota-window refill (~60s) when Google gives no
    // Retry-After to follow.
    describe('with the app branch quota-bridge schedule', () => {
        it('reaches a cumulative wait of at least 65s across attempts when Google never sends Retry-After', async () => {
            vi.mocked(sleep).mockClear();
            const write = vi
                .fn()
                .mockRejectedValue(new GoogleSheetsQuotaError());

            await expect(
                retryTransientGoogleSheetsWrite(
                    write,
                    undefined,
                    GSHEET_UPLOAD_QUOTA_BRIDGE_SCHEDULE_MS,
                ),
            ).rejects.toThrow(GoogleSheetsQuotaError);

            const cumulativeWaitMs = vi
                .mocked(sleep)
                .mock.calls.reduce((sum, [ms]) => sum + (ms as number), 0);
            expect(cumulativeWaitMs).toBeGreaterThanOrEqual(65000);
            expect(write).toHaveBeenCalledTimes(
                GSHEET_UPLOAD_QUOTA_BRIDGE_SCHEDULE_MS.length + 1,
            );
        });

        it('still honors a Retry-After hint ahead of the quota-bridge schedule, capped at the ceiling', async () => {
            vi.mocked(sleep).mockClear();
            const write = vi
                .fn()
                .mockRejectedValueOnce(
                    new GoogleSheetsQuotaError('quota', {
                        retryAfterMs: 5000,
                    }),
                )
                .mockResolvedValueOnce(undefined);

            await retryTransientGoogleSheetsWrite(
                write,
                undefined,
                GSHEET_UPLOAD_QUOTA_BRIDGE_SCHEDULE_MS,
            );

            // Not the schedule's first entry (2000) — the honored hint wins.
            expect(vi.mocked(sleep)).toHaveBeenCalledWith(5000);
        });
    });
});

describe('computeGsheetsPacingDelayMs', () => {
    it('spreads writesPerItem writes across a minute at the given budget', () => {
        // 60_000 * 3 / 55, rounded up so the sustained rate never exceeds budget.
        expect(computeGsheetsPacingDelayMs(3, 55)).toBe(3273);
    });

    it('defaults to GSHEETS_WRITES_PER_MINUTE_BUDGET when no budget is given', () => {
        expect(computeGsheetsPacingDelayMs(3)).toBe(
            Math.ceil((60_000 * 3) / GSHEETS_WRITES_PER_MINUTE_BUDGET),
        );
    });
});

describe('processSequentiallyWithPacing', () => {
    it('never sleeps when the pacing delay is 0, regardless of item count', async () => {
        const sleepFn = vi.fn().mockResolvedValue(undefined);
        const processItem = vi.fn().mockResolvedValue(undefined);

        await processSequentiallyWithPacing([1, 2, 3], 0, processItem, sleepFn);

        expect(sleepFn).not.toHaveBeenCalled();
        expect(processItem).toHaveBeenCalledTimes(3);
    });

    it('never sleeps before the first item, only between items', async () => {
        const sleepFn = vi.fn().mockResolvedValue(undefined);
        const processItem = vi.fn().mockResolvedValue(undefined);

        await processSequentiallyWithPacing(
            [1, 2, 3],
            100,
            processItem,
            sleepFn,
        );

        expect(sleepFn).toHaveBeenCalledTimes(2);
        expect(sleepFn).toHaveBeenCalledWith(100);
    });

    it('processes items in order, one at a time', async () => {
        const order: number[] = [];
        const sleepFn = vi.fn().mockResolvedValue(undefined);

        await processSequentiallyWithPacing(
            [1, 2, 3],
            50,
            async (item) => {
                order.push(item);
            },
            sleepFn,
        );

        expect(order).toEqual([1, 2, 3]);
    });
});

describe('buildItemMapFromColumns', () => {
    it('maps a string column to a DIMENSION with STRING type', () => {
        const result = buildItemMapFromColumns([
            { key: 'name', label: 'Full Name', type: 'string' },
        ]);
        expect(result.name).toMatchObject({
            name: 'name',
            label: 'Full Name',
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
        });
    });

    it('maps a number column to a METRIC with NUMBER type', () => {
        const result = buildItemMapFromColumns([
            { key: 'revenue', type: 'number' },
        ]);
        expect(result.revenue).toMatchObject({
            name: 'revenue',
            label: 'revenue',
            fieldType: FieldType.METRIC,
            type: MetricType.NUMBER,
        });
    });

    it('maps date, timestamp, and boolean column types correctly', () => {
        const result = buildItemMapFromColumns([
            { key: 'd', type: 'date' },
            { key: 'ts', type: 'timestamp' },
            { key: 'flag', type: 'boolean' },
        ]);
        expect(result.d).toMatchObject({
            type: DimensionType.DATE,
        });
        expect(result.ts).toMatchObject({
            type: DimensionType.TIMESTAMP,
        });
        expect(result.flag).toMatchObject({
            type: DimensionType.BOOLEAN,
        });
    });

    it('falls back to STRING type when column type is undefined', () => {
        const result = buildItemMapFromColumns([{ key: 'misc' }]);
        expect(result.misc).toMatchObject({
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
        });
    });

    it('uses key as label when label is absent', () => {
        const result = buildItemMapFromColumns([{ key: 'col1' }]);
        expect(result.col1).toMatchObject({ label: 'col1' });
    });
});

describe('dedupeArtifactFilename', () => {
    it('leaves the first occurrence untouched', () => {
        const used = new Map<string, number>();
        expect(dedupeArtifactFilename('csv-Q_A-2026.csv', used)).toBe(
            'csv-Q_A-2026.csv',
        );
    });

    it('suffixes repeats before the extension', () => {
        const used = new Map<string, number>();
        dedupeArtifactFilename('csv-Q_A-2026.csv', used);
        expect(dedupeArtifactFilename('csv-Q_A-2026.csv', used)).toBe(
            'csv-Q_A-2026 (2).csv',
        );
        expect(dedupeArtifactFilename('csv-Q_A-2026.csv', used)).toBe(
            'csv-Q_A-2026 (3).csv',
        );
    });

    it('appends the suffix at the end when there is no extension', () => {
        const used = new Map<string, number>();
        dedupeArtifactFilename('report', used);
        expect(dedupeArtifactFilename('report', used)).toBe('report (2)');
    });
});

describe('uploadGsheetFromQuery', () => {
    // SchedulerTask has 20+ constructor dependencies. We create minimal mocks
    // for only the services touched by the rows branch.

    const makeTask = (
        overrides: Partial<ConstructorParameters<typeof SchedulerTask>[0]> = {},
    ) => {
        const stub = {} as ConstructorParameters<typeof SchedulerTask>[0];
        const task = new SchedulerTask({
            ...stub,
            ...overrides,
        });
        return task;
    };

    it('calls createNewSheet with payload.title and appendToSheet with payload rows — never calls executeMetricQueryAndGetResults', async () => {
        const mockCreateNewSheet = vi.fn().mockResolvedValue({
            spreadsheetId: 'sheet-123',
            spreadsheetUrl: 'https://sheets.example.com/sheet-123',
        });
        const mockAppendToSheet = vi.fn().mockResolvedValue(undefined);
        const mockGetRefreshToken = vi.fn().mockResolvedValue('refresh-token');
        const mockGetAccountByUserUuid = vi.fn().mockResolvedValue({
            user: { id: 'user-1' },
        });
        const mockLogSchedulerJob = vi.fn().mockResolvedValue(undefined);
        const mockTrackAccount = vi.fn();
        const mockTrack = vi.fn();
        const mockExecuteMetricQueryAndGetResults = vi.fn();

        const task = makeTask({
            googleDriveClient: {
                isEnabled: true,
                createNewSheet: mockCreateNewSheet,
                appendToSheet: mockAppendToSheet,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['googleDriveClient'],
            userService: {
                getRefreshToken: mockGetRefreshToken,
                getAccountByUserUuid: mockGetAccountByUserUuid,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['userService'],
            schedulerService: {
                logSchedulerJob: mockLogSchedulerJob,
                updateGsheetExportProgress: vi
                    .fn()
                    .mockResolvedValue(undefined),
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['schedulerService'],
            analytics: {
                trackAccount: mockTrackAccount,
                track: mockTrack,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['analytics'],
            asyncQueryService: {
                executeMetricQueryAndGetResults:
                    mockExecuteMetricQueryAndGetResults,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['asyncQueryService'],
            lightdashConfig: {
                query: {},
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['lightdashConfig'],
        });

        const payload = {
            source: 'rows' as const,
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            title: 'My App Export',
            columns: [
                { key: 'name', label: 'Name', type: 'string' as const },
                { key: 'amount', type: 'number' as const },
            ],
            rows: [
                { name: 'Alice', amount: 100 },
                { name: 'Bob', amount: 200 },
            ],
        };

        // Access protected method via cast
        await (
            task as unknown as {
                uploadGsheetFromQuery(
                    jobId: string,
                    scheduledTime: Date,
                    payload: UploadGsheetPayload,
                ): Promise<void>;
            }
        ).uploadGsheetFromQuery('job-1', new Date(), payload);

        expect(mockCreateNewSheet).toHaveBeenCalledWith(
            'refresh-token',
            'My App Export',
        );
        expect(mockAppendToSheet).toHaveBeenCalledTimes(1);
        expect(mockAppendToSheet.mock.calls[0][2]).toEqual(payload.rows);
        expect(mockExecuteMetricQueryAndGetResults).not.toHaveBeenCalled();
    });

    it('passes selected parameter values to the exported metric query', async () => {
        const queryError = new Error('query failed');
        const mockExecuteMetricQueryAndGetResults = vi
            .fn()
            .mockRejectedValue(queryError);
        const task = makeTask({
            googleDriveClient: {
                isEnabled: true,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['googleDriveClient'],
            userService: {
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { id: 'user-1' },
                }),
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['userService'],
            schedulerService: {
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['schedulerService'],
            analytics: {
                trackAccount: vi.fn(),
                track: vi.fn(),
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['analytics'],
            asyncQueryService: {
                executeMetricQueryAndGetResults:
                    mockExecuteMetricQueryAndGetResults,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['asyncQueryService'],
        });
        const parameters = { currency: 'EUR' };
        const payload = {
            source: 'metricQuery',
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            exploreId: 'orders',
            metricQuery: {} as MetricQuery,
            showTableNames: true,
            columnOrder: [],
            parameters,
        } as UploadGsheetPayload;

        await expect(
            (
                task as unknown as {
                    uploadGsheetFromQuery(
                        jobId: string,
                        scheduledTime: Date,
                        jobPayload: UploadGsheetPayload,
                    ): Promise<void>;
                }
            ).uploadGsheetFromQuery('job-1', new Date(), payload),
        ).rejects.toThrow(queryError);

        expect(mockExecuteMetricQueryAndGetResults).toHaveBeenCalledWith(
            expect.objectContaining({ parameters }),
            expect.anything(),
        );
    });
});

type TaskDeps = ConstructorParameters<typeof SchedulerTask>[0];

class TestSchedulerTask extends SchedulerTask {
    public exportContentForTest(payload: ExportContentPayload) {
        return this.exportContent('export-job', new Date(), payload);
    }

    public sendEmailNotificationForTest(
        jobId: string,
        notification: EmailNotificationPayload,
    ) {
        return this.sendEmailNotification(jobId, notification);
    }
}

const makeTaskWithDeps = (overrides: Partial<TaskDeps> = {}) =>
    new TestSchedulerTask({ ...({} as TaskDeps), ...overrides });

const asDep = <K extends keyof TaskDeps>(value: unknown): TaskDeps[K] =>
    value as TaskDeps[K];

describe('PDF content export', () => {
    const payload: ExportContentPayload = {
        resourceType: SchedulerResourceType.DASHBOARD,
        resourceUuid: 'dashboard-1',
        format: SchedulerFormat.PDF,
        options: {},
        userUuid: 'user-1',
        projectUuid: 'project-1',
        organizationUuid: 'org-1',
        schedulerUuid: undefined,
        selectedTabs: ['tab-1'],
        parameters: { region: 'APAC' },
    };

    const setup = (storageEnabled = true) => {
        const logSchedulerJob = vi.fn();
        const getNotificationPageData = vi.fn().mockResolvedValue({
            pdfFile: {
                source: 'https://storage.example/export.pdf',
                fileName: 'export.pdf',
            },
        });
        const task = makeTaskWithDeps({
            schedulerService: asDep<'schedulerService'>({ logSchedulerJob }),
            fileStorageClient: asDep<'fileStorageClient'>({
                isEnabled: () => storageEnabled,
            }),
        });
        Object.assign(task, { getNotificationPageData });
        return { task, logSchedulerJob, getNotificationPageData };
    };

    it('uses the scheduled PDF path and records a downloadable PDF result', async () => {
        const { task, logSchedulerJob, getNotificationPageData } = setup();
        await task.exportContentForTest(payload);

        expect(getNotificationPageData).toHaveBeenCalledWith(
            expect.objectContaining({
                format: SchedulerFormat.PDF,
                selectedTabs: ['tab-1'],
            }),
            'export-job',
            false,
            undefined,
            expect.objectContaining({ parameters: payload.parameters }),
            undefined,
            undefined,
            PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
        );
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: SchedulerJobStatus.COMPLETED,
                details: expect.objectContaining({
                    url: 'https://storage.example/export.pdf',
                    fileType: SchedulerFormat.PDF,
                    numFailures: 0,
                }),
            }),
        );
    });

    it('fails when the renderer does not produce a PDF', async () => {
        const { task, getNotificationPageData } = setup();
        getNotificationPageData.mockResolvedValue({});
        await expect(task.exportContentForTest(payload)).rejects.toThrow(
            'Dashboard PDF export failed',
        );
    });

    it('rejects exports without storage before rendering a local-only file', async () => {
        const { task, getNotificationPageData } = setup(false);
        await expect(task.exportContentForTest(payload)).rejects.toThrow(
            'Cloud storage is not enabled',
        );
        expect(getNotificationPageData).not.toHaveBeenCalled();
    });
});

describe('compileProject', () => {
    it('enqueues custom-field replacement after a successful preview compile without waiting for it', async () => {
        const replaceCustomFields = vi.fn(
            () =>
                new Promise<never>(() => {
                    // Intentionally left pending to verify fire-and-forget.
                }),
        );
        const generateValidation = vi.fn();
        const task = makeTaskWithDeps({
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({
                    userUuid: 'user-1',
                    organizationUuid: 'org-1',
                }),
            }),
            projectService: asDep<'projectService'>({
                compileProject: vi.fn().mockResolvedValue(undefined),
            }),
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            }),
            schedulerClient: asDep<'schedulerClient'>({
                generateValidation,
                replaceCustomFields,
            }),
        });
        const payload: CompileProjectPayload = {
            createdByUserUuid: 'user-1',
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            requestMethod: RequestMethod.WEB_APP,
            jobUuid: 'compile-job-1',
            isPreview: true,
            validateAfterCompile: false,
        };

        await (
            task as unknown as {
                compileProject(
                    jobId: string,
                    scheduledTime: Date,
                    compilePayload: CompileProjectPayload,
                ): Promise<void>;
            }
        ).compileProject('scheduler-job-1', new Date(), payload);

        expect(generateValidation).not.toHaveBeenCalled();
        expect(replaceCustomFields).toHaveBeenCalledWith({
            userUuid: 'user-1',
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
        });
    });

    it('does not enqueue custom-field replacement when compilation fails', async () => {
        const compileError = new Error('compile failed');
        const replaceCustomFields = vi.fn();
        const task = makeTaskWithDeps({
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({
                    userUuid: 'user-1',
                    organizationUuid: 'org-1',
                }),
            }),
            projectService: asDep<'projectService'>({
                compileProject: vi.fn().mockRejectedValue(compileError),
            }),
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            }),
            schedulerClient: asDep<'schedulerClient'>({ replaceCustomFields }),
        });
        const payload: CompileProjectPayload = {
            createdByUserUuid: 'user-1',
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            requestMethod: RequestMethod.WEB_APP,
            jobUuid: 'compile-job-1',
            isPreview: false,
        };

        await expect(
            (
                task as unknown as {
                    compileProject(
                        jobId: string,
                        scheduledTime: Date,
                        compilePayload: CompileProjectPayload,
                    ): Promise<void>;
                }
            ).compileProject('scheduler-job-1', new Date(), payload),
        ).rejects.toThrow(compileError);

        expect(replaceCustomFields).not.toHaveBeenCalled();
    });
});

describe('learnSandboxCommand', () => {
    it('runs the command through LearnSandboxService', async () => {
        const runCommand = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            }),
            learnSandboxService: asDep<'learnSandboxService'>({
                runCommand,
            }),
        });
        const payload: LearnSandboxCommandPayload = {
            commandUuid: 'command-1',
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
            userUuid: 'user-1',
        };

        await (
            task as unknown as {
                learnSandboxCommand(
                    jobId: string,
                    scheduledTime: Date,
                    commandPayload: LearnSandboxCommandPayload,
                ): Promise<void>;
            }
        ).learnSandboxCommand('scheduler-job-1', new Date(), payload);

        expect(runCommand).toHaveBeenCalledWith(payload);
    });

    it('propagates errors from the sandbox run', async () => {
        const runError = new Error('sandbox run failed');
        const task = makeTaskWithDeps({
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            }),
            learnSandboxService: asDep<'learnSandboxService'>({
                runCommand: vi.fn().mockRejectedValue(runError),
            }),
        });
        const payload: LearnSandboxCommandPayload = {
            commandUuid: 'command-1',
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
            userUuid: 'user-1',
        };

        await expect(
            (
                task as unknown as {
                    learnSandboxCommand(
                        jobId: string,
                        scheduledTime: Date,
                        commandPayload: LearnSandboxCommandPayload,
                    ): Promise<void>;
                }
            ).learnSandboxCommand('scheduler-job-1', new Date(), payload),
        ).rejects.toThrow(runError);
    });
});

describe('uploadGsheets — pivot routing', () => {
    const validPivotDetails: NonNullable<
        ReadyQueryResultsPage['pivotDetails']
    > = {
        totalColumnCount: 1,
        indexColumn: [
            {
                reference: 'orders_order_date',
                type: VizIndexType.TIME,
            },
        ],
        valuesColumns: [
            {
                referenceField: 'orders_count',
                pivotColumnName: 'orders_count_any_complete',
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        referenceField: 'orders_status',
                        value: 'complete',
                    },
                ],
            },
        ],
        groupByColumns: [{ reference: 'orders_status' }],
        sortBy: [],
        originalColumns: {},
    };
    const itemMap = buildItemMapFromColumns([
        { key: 'orders_order_date', type: 'date' },
        { key: 'orders_status', type: 'string' },
        { key: 'orders_count', type: 'number' },
    ]);
    const flatRows = [{ orders_order_date: '2026-08-04' }];
    const pivotedRows = [
        {
            orders_order_date: '2026-08-04',
            orders_count_any_complete: 42,
        },
    ];

    const makeChart = (hasPivotConfig: boolean) => ({
        uuid: 'chart-1',
        projectUuid: 'project-1',
        chartConfig: {
            type: ChartType.TABLE,
            config: {},
        },
        metricQuery: {
            dimensions: ['orders_order_date', 'orders_status'],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        pivotConfig: hasPivotConfig
            ? { columns: ['orders_status'] }
            : undefined,
        tableConfig: {
            columnOrder: ['orders_order_date', 'orders_status', 'orders_count'],
        },
    });

    const setup = ({
        source,
        hasPivotConfig,
        pivotDetails,
        schedulerFilters,
        schedulerParameters,
        dashboardParameters,
    }: {
        source: 'saved-chart' | 'dashboard';
        hasPivotConfig: boolean;
        pivotDetails: ReadyQueryResultsPage['pivotDetails'];
        schedulerFilters?: Filters;
        schedulerParameters?: ParametersValuesMap;
        dashboardParameters?: DashboardParameters;
    }) => {
        const appendToSheet = vi.fn().mockResolvedValue(undefined);
        const appendCsvToSheet = vi.fn().mockResolvedValue(undefined);
        const logSchedulerJob = vi.fn().mockResolvedValue(undefined);
        const executeSavedChartQueryAndGetResults = vi.fn().mockResolvedValue({
            rows: pivotDetails ? pivotedRows : flatRows,
            fields: itemMap,
            pivotDetails,
            displayTimezone: null,
        });
        const executeDashboardChartQueryAndGetResults = vi
            .fn()
            .mockResolvedValue({
                rows: pivotDetails ? pivotedRows : flatRows,
                fields: itemMap,
                pivotDetails,
                displayTimezone: null,
            });
        const chart = makeChart(hasPivotConfig);
        const dashboardUuid = source === 'dashboard' ? 'dashboard-1' : null;
        const scheduler = {
            schedulerUuid: 'scheduler-1',
            name: 'Daily sync',
            createdBy: 'user-1',
            format: SchedulerFormat.GSHEETS,
            savedChartUuid: source === 'saved-chart' ? chart.uuid : null,
            dashboardUuid,
            savedSqlUuid: null,
            cron: '0 7 * * *',
            timezone: 'UTC',
            options: { gdriveId: 'sheet-1' },
            thresholds: undefined,
            filters: schedulerFilters,
            parameters: schedulerParameters,
        };
        const task = makeTaskWithDeps({
            googleDriveClient: asDep<'googleDriveClient'>({
                isEnabled: true,
                uploadMetadata: vi.fn().mockResolvedValue(undefined),
                createNewTab: vi.fn().mockResolvedValue('Chart'),
                appendToSheet,
                appendCsvToSheet,
            }),
            schedulerService: asDep<'schedulerService'>({
                schedulerModel: {
                    getSchedulerAndTargets: vi
                        .fn()
                        .mockResolvedValue(scheduler),
                },
                savedChartModel: {
                    get: vi.fn().mockResolvedValue(chart),
                },
                getSchedulerDefaultTimezone: vi.fn().mockResolvedValue('UTC'),
                logSchedulerJob,
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({}),
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { email: 'demo@lightdash.com' },
                    organization: { organizationUuid: 'org-1' },
                }),
                getRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
            }),
            asyncQueryService: asDep<'asyncQueryService'>({
                executeSavedChartQueryAndGetResults,
                executeDashboardChartQueryAndGetResults,
            }),
            dashboardService: asDep<'dashboardService'>({
                getByIdOrSlug: vi.fn().mockResolvedValue({
                    uuid: dashboardUuid,
                    projectUuid: 'project-1',
                    filters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    tiles: [
                        {
                            uuid: 'tile-1',
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                title: 'Chart',
                                savedChartUuid: chart.uuid,
                            },
                        },
                    ],
                    displayTimezone: null,
                    parameters: dashboardParameters,
                }),
            }),
            analytics: asDep<'analytics'>({ track: vi.fn() }),
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'http://localhost:8090',
            }),
        });

        const run = () =>
            (
                task as unknown as {
                    uploadGsheets(
                        jobId: string,
                        notification: {
                            schedulerUuid: string;
                            scheduledTime: Date;
                            jobGroup: string;
                            userUuid: string;
                            organizationUuid: string;
                            projectUuid: string;
                        },
                    ): Promise<void>;
                }
            ).uploadGsheets('job-1', {
                schedulerUuid: scheduler.schedulerUuid,
                scheduledTime: new Date('2026-08-04T07:00:00Z'),
                jobGroup: 'scheduled_delivery',
                userUuid: 'user-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });

        return {
            appendToSheet,
            appendCsvToSheet,
            logSchedulerJob,
            executeSavedChartQueryAndGetResults,
            executeDashboardChartQueryAndGetResults,
            run,
        };
    };

    it.each(['saved-chart', 'dashboard'] as const)(
        'exports flat %s results when stale pivot config has no SQL pivot details',
        async (source) => {
            const result = setup({
                source,
                hasPivotConfig: true,
                pivotDetails: null,
            });

            await result.run();

            expect(result.appendToSheet).toHaveBeenCalledOnce();
            expect(result.appendCsvToSheet).not.toHaveBeenCalled();
        },
    );

    it.each(['saved-chart', 'dashboard'] as const)(
        'exports pivoted %s results when SQL pivot details exist',
        async (source) => {
            const result = setup({
                source,
                hasPivotConfig: true,
                pivotDetails: validPivotDetails,
            });

            await result.run();

            expect(result.appendCsvToSheet).toHaveBeenCalledOnce();
            expect(result.appendToSheet).not.toHaveBeenCalled();
        },
    );

    it('keeps non-pivoted saved-chart results on the flat writer', async () => {
        const result = setup({
            source: 'saved-chart',
            hasPivotConfig: false,
            pivotDetails: null,
        });

        await result.run();

        expect(result.appendToSheet).toHaveBeenCalledOnce();
        expect(result.appendCsvToSheet).not.toHaveBeenCalled();
        expect(result.logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'completed' }),
        );
    });

    it('runs a saved-chart sync with the delivery filter overrides', async () => {
        const schedulerFilters: Filters = {
            dimensions: {
                id: 'delivery',
                and: [
                    {
                        id: 'status-rule',
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['shipped'],
                    },
                ],
            },
        };
        const result = setup({
            source: 'saved-chart',
            hasPivotConfig: false,
            pivotDetails: null,
            schedulerFilters,
        });

        await result.run();

        expect(result.executeSavedChartQueryAndGetResults).toHaveBeenCalledWith(
            expect.objectContaining({ chartUuid: 'chart-1', schedulerFilters }),
            expect.anything(),
        );
    });

    it('runs a dashboard sync with the delivery parameter overrides', async () => {
        const result = setup({
            source: 'dashboard',
            hasPivotConfig: false,
            pivotDetails: null,
            dashboardParameters: {
                'orders.status': {
                    parameterName: 'orders.status',
                    value: 'placed',
                },
                'orders.region': {
                    parameterName: 'orders.region',
                    value: 'EU',
                },
            },
            schedulerParameters: { 'orders.status': 'shipped' },
        });

        await result.run();

        expect(
            result.executeDashboardChartQueryAndGetResults,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: {
                    'orders.status': 'shipped',
                    'orders.region': 'EU',
                },
            }),
            expect.anything(),
        );
    });
});

describe('uploadGsheets — SQL chart values', () => {
    it('preserves numbers and booleans while retaining text, blank, and date values', async () => {
        const row = {
            orders_any_complete: 42,
            rate: -0.125,
            zero: 0,
            active: true,
            inactive: false,
            numericText: '000042',
            nullValue: null,
            missingValue: undefined,
            date: new Date('2026-09-30T12:00:00Z'),
        };
        const appendCsvToSheet = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            googleDriveClient: asDep<'googleDriveClient'>({
                isEnabled: true,
                uploadMetadata: vi.fn().mockResolvedValue(undefined),
                appendCsvToSheet,
            }),
            schedulerService: asDep<'schedulerService'>({
                schedulerModel: {
                    getSchedulerAndTargets: vi.fn().mockResolvedValue({
                        schedulerUuid: 'scheduler-1',
                        name: 'SQL chart sync',
                        createdBy: 'user-1',
                        format: SchedulerFormat.GSHEETS,
                        savedChartUuid: null,
                        dashboardUuid: null,
                        savedSqlUuid: 'sql-chart-1',
                        appUuid: null,
                        cron: '0 7 * * *',
                        timezone: 'UTC',
                        options: { gdriveId: 'sheet-1', tabName: 'Results' },
                    }),
                },
                getSchedulerDefaultTimezone: vi.fn().mockResolvedValue('UTC'),
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({}),
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { email: 'demo@lightdash.com' },
                    organization: { organizationUuid: 'org-1' },
                }),
                getRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
            }),
            asyncQueryService: asDep<'asyncQueryService'>({
                savedSqlModel: {
                    getByUuid: vi.fn().mockResolvedValue({
                        slug: 'sql-chart',
                        project: { projectUuid: 'project-1' },
                    }),
                },
                executeSqlChartQueryAndGetResults: vi.fn().mockResolvedValue({
                    rows: [row],
                }),
            }),
            analytics: asDep<'analytics'>({ track: vi.fn() }),
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'http://localhost:8090',
            }),
        });

        await (
            task as unknown as {
                uploadGsheets(
                    jobId: string,
                    notification: GsheetsNotificationPayload,
                ): Promise<void>;
            }
        ).uploadGsheets('job-1', {
            schedulerUuid: 'scheduler-1',
            scheduledTime: new Date('2026-09-30T07:00:00Z'),
            jobGroup: 'scheduled_delivery',
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
        });

        expect(appendCsvToSheet).toHaveBeenCalledExactlyOnceWith(
            'refresh-token',
            'sheet-1',
            [
                Object.keys(row),
                [
                    42,
                    -0.125,
                    0,
                    true,
                    false,
                    '000042',
                    '',
                    '',
                    '2026-09-30T12:00:00.000Z',
                ],
            ],
            'Results',
        );
    });
});

describe('handleScheduledDelivery execution identity', () => {
    const persistedScheduler = {
        schedulerUuid: 'scheduler-1',
        slug: 'scheduler',
        name: 'scheduler',
        createdAt: new Date('2026-08-03T09:00:00Z'),
        updatedAt: new Date('2026-08-03T09:00:00Z'),
        createdBy: 'scheduler-owner',
        createdByName: 'Scheduler Owner',
        format: SchedulerFormat.CSV,
        cron: '0 9 * * *',
        savedChartUuid: 'chart-1',
        savedChartName: 'Chart',
        dashboardUuid: null,
        dashboardName: null,
        savedSqlUuid: null,
        savedSqlName: null,
        appUuid: null,
        appName: null,
        options: { formatted: true, limit: 'table' },
        enabled: true,
        includeLinks: true,
        plainTextEmail: false,
        targets: [],
    } as SchedulerAndTargets;

    const setup = () => {
        const getSessionByUserUuid = vi.fn(async (userUuid: string) => ({
            userUuid,
        }));
        const getAccountByUserUuid = vi.fn(async (userUuid: string) => ({
            userUuid,
        }));
        const setSchedulerEnabled = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            schedulerService: asDep<'schedulerService'>({
                schedulerModel: {
                    getSchedulerAndTargets: vi
                        .fn()
                        .mockResolvedValue(persistedScheduler),
                },
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
                setSchedulerEnabled,
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid,
                getAccountByUserUuid,
            }),
            analytics: asDep<'analytics'>({ track: vi.fn() }),
        });

        const run = (executionUserUuid?: string) =>
            (
                task as unknown as {
                    handleScheduledDelivery(
                        jobId: string,
                        scheduledTime: Date,
                        payload: ScheduledDeliveryPayload,
                        isFinalAttempt: boolean,
                    ): Promise<void>;
                }
            ).handleScheduledDelivery(
                'job-1',
                new Date('2026-08-03T10:00:00Z'),
                {
                    schedulerUuid: persistedScheduler.schedulerUuid,
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                    userUuid: 'job-actor',
                    executionUserUuid,
                },
                true,
            );

        return {
            task,
            run,
            getSessionByUserUuid,
            getAccountByUserUuid,
            setSchedulerEnabled,
        };
    };

    it('uses the authenticated triggerer for a persisted send-now run', async () => {
        const {
            run,
            getSessionByUserUuid,
            getAccountByUserUuid,
            setSchedulerEnabled,
        } = setup();

        await run('triggering-user');

        expect(getSessionByUserUuid).toHaveBeenNthCalledWith(
            1,
            'triggering-user',
        );
        expect(getAccountByUserUuid).toHaveBeenCalledWith('triggering-user');
        expect(setSchedulerEnabled).toHaveBeenCalledWith(
            { userUuid: 'scheduler-owner' },
            persistedScheduler.schedulerUuid,
            false,
        );
    });

    it('uses the persisted owner for a recurring run', async () => {
        const { run, getSessionByUserUuid, getAccountByUserUuid } = setup();

        await run();

        expect(getSessionByUserUuid).toHaveBeenCalledTimes(1);
        expect(getSessionByUserUuid).toHaveBeenCalledWith('scheduler-owner');
        expect(getAccountByUserUuid).toHaveBeenCalledWith('scheduler-owner');
    });

    it('ignores an execution-user override on an inline client payload', async () => {
        const { task, getSessionByUserUuid, getAccountByUserUuid } = setup();

        await (
            task as unknown as {
                handleScheduledDelivery(
                    jobId: string,
                    scheduledTime: Date,
                    payload: ScheduledDeliveryPayload,
                    isFinalAttempt: boolean,
                ): Promise<void>;
            }
        ).handleScheduledDelivery(
            'job-1',
            new Date('2026-08-03T10:00:00Z'),
            {
                ...persistedScheduler,
                schedulerUuid: undefined,
                createdBy: 'authenticated-caller',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'authenticated-caller',
                executionUserUuid: 'forged-user',
            } as unknown as ScheduledDeliveryPayload,
            true,
        );

        expect(getSessionByUserUuid).toHaveBeenCalledTimes(1);
        expect(getSessionByUserUuid).toHaveBeenCalledWith(
            'authenticated-caller',
        );
        expect(getAccountByUserUuid).toHaveBeenCalledWith(
            'authenticated-caller',
        );
    });
});

const APP_ROW = {
    project_uuid: 'project-1',
    organization_uuid: 'org-1',
    name: 'Sales App',
    description: 'Sales overview',
};

const readyItem = (
    overrides: Partial<Extract<CapturedQuery, { status: 'ready' }>> = {},
): CapturedQuery => ({
    status: 'ready',
    captureKey: 'v1:key-1',
    label: 'Revenue by month',
    exploreName: 'orders',
    queryUuid: 'query-1',
    order: 0,
    rowCount: 42,
    limitReached: false,
    ...overrides,
});

const errorItem = (
    overrides: Partial<Extract<CapturedQuery, { status: 'error' }>> = {},
): CapturedQuery => ({
    status: 'error',
    captureKey: 'v1:key-err',
    label: 'Broken query',
    exploreName: null,
    queryUuid: null,
    order: 9,
    error: 'Query timed out',
    ...overrides,
});

const manifestOf = (
    items: CapturedQuery[],
    overflowCount = 0,
): DeliveryCaptureManifest => ({ version: 1, items, overflowCount });

const appScheduler = (
    overrides: Partial<CreateSchedulerAndTargets> = {},
): CreateSchedulerAndTargets =>
    ({
        name: 'App delivery',
        createdBy: 'user-1',
        format: SchedulerFormat.CSV,
        cron: '0 9 * * *',
        timezone: 'UTC',
        savedChartUuid: null,
        dashboardUuid: null,
        savedSqlUuid: null,
        appUuid: 'app-1',
        appName: 'Sales App',
        options: { formatted: true, limit: 'table' },
        enabled: true,
        includeLinks: true,
        plainTextEmail: false,
        targets: [],
        ...overrides,
    }) as CreateSchedulerAndTargets;

type PageData = NotificationPayloadBase['page'];

const callGetNotificationPageData = (
    task: SchedulerTask,
    scheduler: CreateSchedulerAndTargets,
    appCaptureManifest?: DeliveryCaptureManifest,
    expirationSecondsOverride?: number,
): Promise<PageData> =>
    (
        task as unknown as {
            getNotificationPageData(
                scheduler: CreateSchedulerAndTargets,
                jobId: string,
                isFinalAttempt: boolean,
                expirationSecondsOverride?: number,
                exportOptions?: undefined,
                appCaptureManifest?: DeliveryCaptureManifest,
            ): Promise<PageData>;
        }
    ).getNotificationPageData(
        scheduler,
        'job-1',
        false,
        expirationSecondsOverride,
        undefined,
        appCaptureManifest,
    );

describe('getNotificationPageData — app CSV/XLSX branch', () => {
    const setup = ({
        download,
        fileStorageEnabled = false,
        rerun,
        rerunAppliedLimit = 10000,
        queryRowCount = 100,
        getQueryHistory,
    }: {
        download?: (args: { queryUuid: string }) => Promise<{
            fileUrl: string;
            s3FileUrl?: string;
        }>;
        fileStorageEnabled?: boolean;
        rerun?: (args: {
            queryUuid: string;
        }) => Promise<
            | { outcome: 'executed'; queryUuid: string; appliedLimit: number }
            | { outcome: 'noImprovementPossible' }
        >;
        // Default rerun outcome's applied limit, when `rerun` isn't overridden.
        rerunAppliedLimit?: number;
        // Default getAsyncQueryHistory row count, when `getQueryHistory` isn't overridden.
        queryRowCount?: number | null;
        getQueryHistory?: (args: {
            queryUuid: string;
        }) => Promise<{ totalRowCount: number | null }>;
    } = {}) => {
        const downloadSyncQueryResults = vi.fn(
            download ??
                (async ({ queryUuid }: { queryUuid: string }) => ({
                    fileUrl: `https://files.example.com/${queryUuid}`,
                    s3FileUrl: `s3://bucket/${queryUuid}`,
                })),
        );
        const executeAsyncUnboundedRerunFromQueryHistory = vi.fn(
            rerun ??
                (async ({ queryUuid }: { queryUuid: string }) => ({
                    outcome: 'executed' as const,
                    queryUuid: `${queryUuid}-rerun`,
                    appliedLimit: rerunAppliedLimit,
                })),
        );
        const getAsyncQueryHistory = vi.fn(
            getQueryHistory ?? (async () => ({ totalRowCount: queryRowCount })),
        );
        const findAppByUuid = vi.fn().mockResolvedValue(APP_ROW);
        const trackAccount = vi.fn();
        const task = makeTaskWithDeps({
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                headlessBrowser: {
                    internalLightdashHost: 'http://lightdash-dev:3000',
                },
                query: {},
            }),
            schedulerService: asDep<'schedulerService'>({
                appModel: { findAppByUuid },
            }),
            userService: asDep<'userService'>({
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { id: 'user-id-1' },
                    organization: { organizationUuid: 'org-1' },
                }),
            }),
            analytics: asDep<'analytics'>({ trackAccount, track: vi.fn() }),
            fileStorageClient: asDep<'fileStorageClient'>({
                isEnabled: () => fileStorageEnabled,
            }),
            asyncQueryService: asDep<'asyncQueryService'>({
                downloadSyncQueryResults,
                executeAsyncUnboundedRerunFromQueryHistory,
                getAsyncQueryHistory,
            }),
            slackClient: asDep<'slackClient'>({ isEnabled: false }),
        });
        return {
            task,
            downloadSyncQueryResults,
            executeAsyncUnboundedRerunFromQueryHistory,
            getAsyncQueryHistory,
            findAppByUuid,
            trackAccount,
        };
    };

    it('downloads every ready query and names the files after the capture labels', async () => {
        const { task, downloadSyncQueryResults } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue by month',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders by status',
                    queryUuid: 'query-b',
                    order: 1,
                }),
                readyItem({
                    captureKey: 'v1:c',
                    label: 'Top customers',
                    queryUuid: 'query-c',
                    order: 2,
                }),
            ]),
            604800,
        );

        expect(downloadSyncQueryResults).toHaveBeenCalledTimes(3);
        expect(downloadSyncQueryResults.mock.calls[0][0]).toMatchObject({
            projectUuid: 'project-1',
            queryUuid: 'query-a',
            type: DownloadFileType.CSV,
            onlyRaw: false,
            expirationSecondsOverride: 604800,
        });
        expect(page.csvUrls).toHaveLength(3);
        expect(page.csvUrls?.map((file) => file.chartName)).toEqual([
            'Revenue by month',
            'Orders by status',
            'Top customers',
        ]);
        page.csvUrls?.forEach((file) => {
            expect(file.truncated).toBe(false);
        });
        expect(page.csvUrls?.[0].filename).toMatch(
            /^csv-Revenue by month-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{4}\.csv$/,
        );
        expect(page.csvUrls?.[0].path).toBe(
            'https://files.example.com/query-a',
        );
        expect(page.csvUrls?.[0].localPath).toBe('s3://bucket/query-a');
        expect(page.failures ?? []).toEqual([]);
        expect(page.notices ?? []).toEqual([]);
    });

    it('passes onlyRaw when the scheduler asks for unformatted values', async () => {
        const { task, downloadSyncQueryResults } = setup();

        await callGetNotificationPageData(
            task,
            appScheduler({ options: { formatted: false, limit: 'table' } }),
            manifestOf([readyItem()]),
        );

        expect(downloadSyncQueryResults.mock.calls[0][0]).toMatchObject({
            onlyRaw: true,
        });
    });

    it('requests XLSX downloads for an XLSX scheduler', async () => {
        const { task, downloadSyncQueryResults } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler({
                format: SchedulerFormat.XLSX,
                options: { formatted: true, limit: 'table' },
            }),
            manifestOf([readyItem({ label: 'Revenue' })]),
        );

        expect(downloadSyncQueryResults.mock.calls[0][0]).toMatchObject({
            type: DownloadFileType.XLSX,
        });
        expect(page.csvUrls?.[0].filename).toMatch(
            /^xlsx-Revenue-[\d-]+\.xlsx$/,
        );
    });

    it('merges the files into a single workbook when the layout is workbook', async () => {
        const { task } = setup({ fileStorageEnabled: true });
        const createWorkbookDownloadUrl = vi.fn().mockResolvedValue({
            url: 'https://files.example.com/workbook.xlsx',
            numFileFailures: 0,
        });
        (task as unknown as Record<string, unknown>).createWorkbookDownloadUrl =
            createWorkbookDownloadUrl;

        const page = await callGetNotificationPageData(
            task,
            appScheduler({
                format: SchedulerFormat.XLSX,
                options: {
                    formatted: true,
                    limit: 'table',
                    xlsxFileLayout: 'workbook',
                },
            }),
            manifestOf([
                readyItem({ label: 'Revenue', queryUuid: 'query-a' }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        );

        expect(createWorkbookDownloadUrl).toHaveBeenCalledTimes(1);
        expect(
            createWorkbookDownloadUrl.mock.calls[0][0].files.map(
                (file: { chartName?: string }) => file.chartName,
            ),
        ).toEqual(['Revenue', 'Orders']);
        expect(createWorkbookDownloadUrl.mock.calls[0][0]).toMatchObject({
            workbookNameBase: 'Sales App',
        });
        expect(page.csvUrls).toEqual([
            {
                filename: 'Sales App',
                path: 'https://files.example.com/workbook.xlsx',
                localPath: 'https://files.example.com/workbook.xlsx',
                truncated: false,
            },
        ]);
    });

    it('delivers the ready queries and reports render-stage failures for the errored ones', async () => {
        const { task, downloadSyncQueryResults } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({ label: 'Revenue', queryUuid: 'query-a' }),
                errorItem({
                    captureKey: 'v1:boom',
                    label: 'Broken query',
                    error: 'Query timed out',
                }),
            ]),
        );

        expect(downloadSyncQueryResults).toHaveBeenCalledTimes(1);
        expect(page.csvUrls).toHaveLength(1);
        expect(page.failures).toEqual([
            {
                type: PartialFailureType.APP_QUERY,
                stage: 'render',
                captureKey: 'v1:boom',
                label: 'Broken query',
                error: 'Query timed out',
            },
        ]);
    });

    it('reports a download-stage failure and still delivers the rest', async () => {
        const { task } = setup({
            download: async ({ queryUuid }) => {
                if (queryUuid === 'query-b') {
                    throw new Error('storage unavailable');
                }
                return { fileUrl: `https://files.example.com/${queryUuid}` };
            },
        });

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({ label: 'Revenue', queryUuid: 'query-a' }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        );

        expect(page.csvUrls).toHaveLength(1);
        expect(page.csvUrls?.[0].chartName).toBe('Revenue');
        expect(page.failures).toEqual([
            {
                type: PartialFailureType.APP_QUERY,
                stage: 'download',
                captureKey: 'v1:b',
                label: 'Orders',
                error: 'storage unavailable',
            },
        ]);
    });

    it('throws when every download fails', async () => {
        const { task } = setup({
            download: async () => {
                throw new Error('storage unavailable');
            },
        });

        await expect(
            callGetNotificationPageData(
                task,
                appScheduler(),
                manifestOf([
                    readyItem({ queryUuid: 'query-a' }),
                    readyItem({
                        captureKey: 'v1:b',
                        queryUuid: 'query-b',
                        order: 1,
                    }),
                ]),
            ),
        ).rejects.toThrow(/all app delivery downloads failed/i);
    });

    it('reports dropped queries as a capture overflow failure', async () => {
        const { task } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([readyItem()], 2),
        );

        expect(page.failures).toEqual([
            {
                type: PartialFailureType.APP_CAPTURE_OVERFLOW,
                droppedCount: 2,
            },
        ]);
    });

    it('reports a limit-reached query as a notice, never as a failure', async () => {
        const { task } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({ label: 'Revenue', rowCount: 500 }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders',
                    queryUuid: 'query-b',
                    order: 1,
                    rowCount: 5000,
                    limitReached: true,
                }),
            ]),
        );

        expect(page.notices).toEqual([
            { type: 'limit_reached', label: 'Orders', rowCount: 5000 },
        ]);
        expect(page.failures ?? []).toEqual([]);
        expect(page.csvUrls).toHaveLength(2);
    });

    it('drops the limit notice when that query never made it into a file', async () => {
        const { task } = setup({
            download: async ({ queryUuid }) => {
                if (queryUuid === 'query-b') {
                    throw new Error('storage unavailable');
                }
                return { fileUrl: `https://files.example.com/${queryUuid}` };
            },
        });

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({ label: 'Revenue', queryUuid: 'query-a' }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders',
                    queryUuid: 'query-b',
                    order: 1,
                    rowCount: 5000,
                    limitReached: true,
                }),
            ]),
        );

        expect(page.csvUrls).toHaveLength(1);
        expect(page.notices ?? []).toEqual([]);
        expect(page.failures).toEqual([
            {
                type: PartialFailureType.APP_QUERY,
                stage: 'download',
                captureKey: 'v1:b',
                label: 'Orders',
                error: 'storage unavailable',
            },
        ]);
    });

    describe('limit: all — unbounded rerun of limit-hit queries', () => {
        const manifestWithOneLimitHit = () =>
            manifestOf([
                readyItem({
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    rowCount: 42,
                    limitReached: false,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders',
                    queryUuid: 'query-b',
                    order: 1,
                    rowCount: 5000,
                    limitReached: true,
                }),
            ]);

        it('re-runs only limit-reached entries, leaving under-limit entries untouched', async () => {
            const { task, executeAsyncUnboundedRerunFromQueryHistory } =
                setup();

            await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            expect(
                executeAsyncUnboundedRerunFromQueryHistory,
            ).toHaveBeenCalledTimes(1);
            expect(
                executeAsyncUnboundedRerunFromQueryHistory.mock.calls[0][0],
            ).toMatchObject({
                projectUuid: 'project-1',
                queryUuid: 'query-b',
            });
        });

        it('never re-runs anything when the scheduler limit is table', async () => {
            const { task, executeAsyncUnboundedRerunFromQueryHistory } =
                setup();

            await callGetNotificationPageData(
                task,
                appScheduler(),
                manifestWithOneLimitHit(),
            );

            expect(
                executeAsyncUnboundedRerunFromQueryHistory,
            ).not.toHaveBeenCalled();
        });

        // Pins the row-count-vs-applied-limit check: the default fixture's
        // rerun applies a limit of 10000 and reports 100 rows back, so the
        // rerun is genuinely complete (rowCount < appliedLimit).
        it('downloads the rerun queryUuid, and drops the limit notice, when the rerun genuinely completes', async () => {
            const { task, downloadSyncQueryResults, getAsyncQueryHistory } =
                setup();

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            expect(downloadSyncQueryResults).toHaveBeenCalledTimes(2);
            expect(downloadSyncQueryResults.mock.calls[1][0]).toMatchObject({
                queryUuid: 'query-b-rerun',
            });
            expect(getAsyncQueryHistory).toHaveBeenCalledWith(
                expect.objectContaining({ queryUuid: 'query-b-rerun' }),
            );
            expect(page.csvUrls).toHaveLength(2);
            expect(page.notices ?? []).toEqual([]);
            expect(page.failures ?? []).toEqual([]);
        });

        // Wide-query case: the export's cell-based cap (e.g. floor(cells /
        // columns) for a 25-column query) can land at or below the query's
        // own already-captured limit. Rerunning would return no more rows,
        // so the service reports 'noImprovementPossible' and the worker must
        // not execute a second query at all.
        it('never downloads a rerun result when the export limit would not improve on the captured query (wide-query case)', async () => {
            const {
                task,
                downloadSyncQueryResults,
                executeAsyncUnboundedRerunFromQueryHistory,
            } = setup({
                rerun: async () => ({ outcome: 'noImprovementPossible' }),
            });

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            expect(
                executeAsyncUnboundedRerunFromQueryHistory,
            ).toHaveBeenCalledTimes(1);
            expect(downloadSyncQueryResults).toHaveBeenCalledTimes(2);
            expect(
                downloadSyncQueryResults.mock.calls.map(
                    (call) => (call[0] as { queryUuid: string }).queryUuid,
                ),
            ).toEqual(['query-a', 'query-b']);
            expect(page.csvUrls).toHaveLength(2);
            expect(page.notices).toEqual([
                { type: 'limit_reached', label: 'Orders', rowCount: 5000 },
            ]);
            expect(page.failures ?? []).toEqual([]);
        });

        // The rerun executes and downloads fine, but the fresh result still
        // hit its own (larger) row cap — a bigger file, but still
        // truthfully truncated, so the notice must survive.
        it('keeps the limit-reached notice when the unbounded rerun itself hits the export cap', async () => {
            const { task, downloadSyncQueryResults } = setup({
                rerunAppliedLimit: 8000,
                queryRowCount: 8000,
            });

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            expect(downloadSyncQueryResults.mock.calls[1][0]).toMatchObject({
                queryUuid: 'query-b-rerun',
            });
            expect(page.csvUrls).toHaveLength(2);
            expect(page.notices).toEqual([
                { type: 'limit_reached', label: 'Orders', rowCount: 5000 },
            ]);
            expect(page.failures ?? []).toEqual([]);
        });

        it('delivers the capped file and keeps the notice when the rerun fails, reporting an APP_QUERY rerun failure', async () => {
            const { task, downloadSyncQueryResults } = setup({
                rerun: async () => {
                    throw new Error('warehouse timeout');
                },
            });

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            // The capped item still downloads under its original queryUuid.
            expect(downloadSyncQueryResults.mock.calls[1][0]).toMatchObject({
                queryUuid: 'query-b',
            });
            expect(page.csvUrls).toHaveLength(2);
            expect(page.notices).toEqual([
                { type: 'limit_reached', label: 'Orders', rowCount: 5000 },
            ]);
            expect(page.failures).toEqual([
                {
                    type: PartialFailureType.APP_QUERY,
                    stage: 'rerun',
                    captureKey: 'v1:b',
                    label: 'Orders',
                    error: expect.stringContaining('warehouse timeout'),
                },
            ]);
        });

        it('falls back to the capped download when the rerun succeeded but its own download fails, reporting a rerun failure', async () => {
            const { task, downloadSyncQueryResults } = setup({
                download: async ({ queryUuid }) => {
                    if (queryUuid === 'query-b-rerun') {
                        throw new Error('poll timeout');
                    }
                    return {
                        fileUrl: `https://files.example.com/${queryUuid}`,
                    };
                },
            });

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            // The rerun result download is attempted first, then the
            // fallback to the still-valid capped original.
            expect(downloadSyncQueryResults).toHaveBeenCalledTimes(3);
            expect(downloadSyncQueryResults.mock.calls[1][0]).toMatchObject({
                queryUuid: 'query-b-rerun',
            });
            expect(downloadSyncQueryResults.mock.calls[2][0]).toMatchObject({
                queryUuid: 'query-b',
            });
            expect(page.csvUrls).toHaveLength(2);
            expect(page.notices).toEqual([
                { type: 'limit_reached', label: 'Orders', rowCount: 5000 },
            ]);
            expect(page.failures).toEqual([
                {
                    type: PartialFailureType.APP_QUERY,
                    stage: 'rerun',
                    captureKey: 'v1:b',
                    label: 'Orders',
                    error: expect.stringContaining('poll timeout'),
                },
            ]);
        });

        it('reports a single download failure, not a double-counted rerun failure, when both the rerun result and the capped fallback fail to download', async () => {
            const { task, downloadSyncQueryResults } = setup({
                download: async ({ queryUuid }) => {
                    if (queryUuid === 'query-b-rerun') {
                        throw new Error('poll timeout');
                    }
                    if (queryUuid === 'query-b') {
                        throw new Error('capped result also gone');
                    }
                    return {
                        fileUrl: `https://files.example.com/${queryUuid}`,
                    };
                },
            });

            const page = await callGetNotificationPageData(
                task,
                appScheduler({ options: { formatted: true, limit: 'all' } }),
                manifestWithOneLimitHit(),
            );

            expect(downloadSyncQueryResults).toHaveBeenCalledTimes(3);
            expect(page.csvUrls).toHaveLength(1);
            expect(page.csvUrls?.[0].chartName).toBe('Revenue');
            // No notice (the item never shipped) and no extra 'rerun'
            // failure alongside the 'download' one.
            expect(page.notices ?? []).toEqual([]);
            expect(page.failures).toEqual([
                {
                    type: PartialFailureType.APP_QUERY,
                    stage: 'download',
                    captureKey: 'v1:b',
                    label: 'Orders',
                    error: expect.stringContaining('poll timeout'),
                },
            ]);
        });
    });

    it('throws when the render captured no successful queries', async () => {
        const { task, downloadSyncQueryResults } = setup();

        await expect(
            callGetNotificationPageData(
                task,
                appScheduler(),
                manifestOf([errorItem()]),
            ),
        ).rejects.toThrow(/captured no successful queries/i);
        expect(downloadSyncQueryResults).not.toHaveBeenCalled();
    });

    it('throws when no capture manifest was provided', async () => {
        const { task } = setup();

        await expect(
            callGetNotificationPageData(task, appScheduler()),
        ).rejects.toThrow(/requires a capture manifest/i);
    });

    it('suffixes filenames that collide once sanitized', async () => {
        const { task } = setup();

        const page = await callGetNotificationPageData(
            task,
            appScheduler(),
            manifestOf([
                readyItem({ label: 'Q/A', queryUuid: 'query-a' }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Q:A',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        );

        const filenames = page.csvUrls?.map((file) => file.filename) ?? [];
        expect(filenames[0]).toMatch(/^csv-Q_A-[\d-]+\.csv$/);
        expect(filenames[1]).toMatch(/^csv-Q_A-[\d-]+ \(2\)\.csv$/);
    });
});

const gsheetsAppScheduler = (overrides: Record<string, unknown> = {}) => ({
    schedulerUuid: 'scheduler-1',
    name: 'Daily app sync',
    createdBy: 'user-1',
    format: SchedulerFormat.GSHEETS,
    savedChartUuid: null,
    dashboardUuid: null,
    savedSqlUuid: null,
    appUuid: 'app-1',
    appName: 'Sales App',
    cron: '0 7 * * *',
    timezone: 'UTC',
    options: { gdriveId: 'sheet-1', showFilters: false },
    thresholds: undefined,
    filters: undefined,
    ...overrides,
});

describe('uploadGsheets — app branch', () => {
    const setup = ({
        manifest = manifestOf([readyItem()]),
        captureAppDeliveryManifest: captureOverride,
        getRawAsyncQueryResults: getRawOverride,
    }: {
        manifest?: DeliveryCaptureManifest;
        captureAppDeliveryManifest?: Mock;
        getRawAsyncQueryResults?: (args: { queryUuid: string }) => Promise<{
            rows: Record<string, unknown>[];
            fields: Record<string, unknown>;
            displayTimezone: string | null;
            metricQuery?: MetricQuery;
        }>;
    } = {}) => {
        const scheduler = gsheetsAppScheduler();
        const captureAppDeliveryManifest =
            captureOverride ?? vi.fn().mockResolvedValue(manifest);
        const createNewTab = vi.fn().mockResolvedValue(undefined);
        const appendCsvToSheet = vi.fn().mockResolvedValue(undefined);
        const uploadMetadata = vi.fn().mockResolvedValue(undefined);
        const logSchedulerJob = vi.fn().mockResolvedValue(undefined);
        const getRawAsyncQueryResults = vi.fn(
            getRawOverride ??
                (async () => ({
                    rows: [{ orders_id: 1, orders_status: 'complete' }],
                    fields: {},
                    displayTimezone: null,
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: ['orders_id', 'orders_status'],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                    },
                })),
        );

        const task = makeTaskWithDeps({
            googleDriveClient: asDep<'googleDriveClient'>({
                isEnabled: true,
                createNewTab,
                appendCsvToSheet,
                uploadMetadata,
            }),
            schedulerService: asDep<'schedulerService'>({
                schedulerModel: {
                    getSchedulerAndTargets: vi
                        .fn()
                        .mockResolvedValue(scheduler),
                },
                getSchedulerDefaultTimezone: vi.fn().mockResolvedValue('UTC'),
                appModel: {
                    findAppByUuid: vi.fn().mockResolvedValue(APP_ROW),
                },
                logSchedulerJob,
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({}),
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { email: 'demo@lightdash.com' },
                    organization: { organizationUuid: 'org-1' },
                }),
                getRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
            }),
            asyncQueryService: asDep<'asyncQueryService'>({
                getRawAsyncQueryResults,
            }),
            unfurlService: asDep<'unfurlService'>({
                captureAppDeliveryManifest,
            }),
            analytics: asDep<'analytics'>({ track: vi.fn() }),
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                headlessBrowser: {
                    internalLightdashHost: 'http://lightdash-dev:3000',
                },
            }),
        });

        const run = () =>
            (
                task as unknown as {
                    uploadGsheets(
                        jobId: string,
                        notification: {
                            schedulerUuid: string;
                            scheduledTime: Date;
                            jobGroup: string;
                            userUuid: string;
                            organizationUuid: string;
                            projectUuid: string;
                        },
                    ): Promise<void>;
                }
            ).uploadGsheets('job-1', {
                schedulerUuid: scheduler.schedulerUuid,
                scheduledTime: new Date('2026-08-04T07:00:00Z'),
                jobGroup: 'scheduled_delivery',
                userUuid: 'user-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });

        return {
            scheduler,
            run,
            captureAppDeliveryManifest,
            createNewTab,
            appendCsvToSheet,
            uploadMetadata,
            logSchedulerJob,
            getRawAsyncQueryResults,
        };
    };

    it('creates one tab per ready item and writes the metadata tab with the frequency, source link and tab list', async () => {
        const {
            run,
            createNewTab,
            appendCsvToSheet,
            uploadMetadata,
            logSchedulerJob,
        } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue by month',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Orders by status',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        });

        await run();

        // appendCsvToSheet creates the tab itself — a separate explicit
        // createNewTab call would just be a second write against the quota.
        expect(createNewTab).not.toHaveBeenCalled();
        expect(appendCsvToSheet).toHaveBeenCalledTimes(2);
        expect(appendCsvToSheet.mock.calls[0][3]).toBe('Revenue by month');
        expect(appendCsvToSheet.mock.calls[1][3]).toBe('Orders by status');
        expect(uploadMetadata).toHaveBeenCalledWith(
            'refresh-token',
            'sheet-1',
            expect.any(String),
            ['Revenue by month', 'Orders by status'],
            expect.stringContaining('/apps/app-1/view'),
        );
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'completed' }),
        );
    });

    // A network-level failure is classified transient by the client; the task
    // must report it as retryable so the worker never disables the sync.
    it('reports a persistent transient Google error as a retryable delivery failure', async () => {
        const { run, uploadMetadata } = setup();
        uploadMetadata.mockRejectedValue(
            new GoogleSheetsTransientError(
                'request to https://oauth2.googleapis.com/token failed, reason: socket hang up',
            ),
        );

        await expect(run()).rejects.toMatchObject({
            name: 'SchedulerDeliveryError',
            isNonRetryable: false,
        } satisfies Partial<SchedulerDeliveryError>);
    });

    it('reports an unexpected Google error as a non-retryable delivery failure', async () => {
        const { run, uploadMetadata } = setup();
        uploadMetadata.mockRejectedValue(
            new UnexpectedGoogleSheetsError('Unknown object'),
        );

        await expect(run()).rejects.toMatchObject({
            name: 'SchedulerDeliveryError',
            isNonRetryable: true,
        } satisfies Partial<SchedulerDeliveryError>);
    });

    // The metadata tab must list what was actually written, not the raw
    // capture labels — a duplicate label is sanitized and suffixed before it
    // becomes a real tab name.
    it('lists the actual sanitized+suffixed tab names in the metadata tab for duplicate labels', async () => {
        const { run, uploadMetadata } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Revenue',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        });

        await run();

        expect(uploadMetadata).toHaveBeenCalledWith(
            'refresh-token',
            'sheet-1',
            expect.any(String),
            ['Revenue (c9ea)', 'Revenue (73b6)'],
            expect.stringContaining('/apps/app-1/view'),
        );
    });

    it('pages rows for each ready item via the completed query, unbounded', async () => {
        const { run, getRawAsyncQueryResults } = setup({
            manifest: manifestOf([readyItem({ queryUuid: 'query-xyz' })]),
        });

        await run();

        expect(getRawAsyncQueryResults).toHaveBeenCalledTimes(1);
        expect(getRawAsyncQueryResults.mock.calls[0][0]).toMatchObject({
            projectUuid: 'project-1',
            queryUuid: 'query-xyz',
        });
        // Same unbounded row bound the chart/dashboard gsheets branches use —
        // no maxRows cap, unlike the AI-augmentation caller of this method.
        expect(getRawAsyncQueryResults.mock.calls[0][0]).not.toHaveProperty(
            'maxRows',
        );
    });

    it('prepends the current query filters with their AND/OR relationships', async () => {
        const { scheduler, run, appendCsvToSheet } = setup({
            getRawAsyncQueryResults: async () => ({
                rows: [{ orders_status: 'complete' }],
                fields: {
                    orders_status: {
                        name: 'status',
                        label: 'Order status',
                        type: DimensionType.STRING,
                        table: 'orders',
                        tableLabel: 'Orders',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.status',
                        hidden: false,
                    },
                    customers_id: {
                        name: 'id',
                        label: 'Customer id',
                        type: DimensionType.NUMBER,
                        table: 'customers',
                        tableLabel: 'Customers',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.id',
                        hidden: false,
                    },
                    customers_created_raw: {
                        name: 'created_raw',
                        label: 'Customers created raw',
                        type: DimensionType.TIMESTAMP,
                        table: 'customers',
                        tableLabel: 'Customers',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.created_at',
                        hidden: false,
                    },
                    customers_last_name: {
                        name: 'last_name',
                        label: 'Customers last name',
                        type: DimensionType.STRING,
                        table: 'customers',
                        tableLabel: 'Customers',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.last_name',
                        hidden: false,
                    },
                    orders_total_revenue: {
                        name: 'total_revenue',
                        label: 'Total revenue',
                        type: DimensionType.NUMBER,
                        table: 'orders',
                        tableLabel: 'Orders',
                        fieldType: FieldType.METRIC,
                        sql: '${TABLE}.total_revenue',
                        hidden: false,
                    },
                },
                displayTimezone: null,
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_revenue'],
                    filters: {
                        dimensions: {
                            id: 'group-1',
                            and: [
                                {
                                    id: 'filter-1',
                                    target: { fieldId: 'customers_id' },
                                    operator: FilterOperator.EQUALS,
                                    values: [40],
                                },
                                {
                                    id: 'group-2',
                                    or: [
                                        {
                                            id: 'filter-2',
                                            target: {
                                                fieldId:
                                                    'customers_created_raw',
                                            },
                                            operator: FilterOperator.NOT_NULL,
                                        },
                                        {
                                            id: 'filter-3',
                                            target: {
                                                fieldId: 'customers_last_name',
                                            },
                                            operator: FilterOperator.NOT_NULL,
                                        },
                                    ],
                                },
                            ],
                        },
                        metrics: {
                            id: 'group-3',
                            and: [
                                {
                                    id: 'filter-4',
                                    target: {
                                        fieldId: 'orders_total_revenue',
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [0],
                                },
                            ],
                        },
                    },
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            }),
        });
        scheduler.options.showFilters = true;

        await run();

        expect(appendCsvToSheet.mock.calls[0][2]).toEqual([
            ['Active filters'],
            [
                'Customer id is 40 AND ' +
                    '(Customers created raw is not null OR ' +
                    'Customers last name is not null) AND ' +
                    'Total revenue is greater than 0',
            ],
            [],
            ['orders_status'],
            ['complete'],
        ]);
    });

    it('sanitizes colons out of tab names, same as the chart/dashboard branches', async () => {
        const { run, createNewTab, appendCsvToSheet } = setup({
            manifest: manifestOf([
                readyItem({ label: 'Sales:Q1', queryUuid: 'query-a' }),
            ]),
        });

        await run();

        expect(createNewTab).not.toHaveBeenCalled();
        expect(appendCsvToSheet.mock.calls[0][3]).toBe('Sales.Q1');
    });

    // Suffixes are derived from each item's own captureKey, not from
    // iteration order, so identity can't drift if the set/order of same-
    // labeled items changes between runs (see the reversed-order test below).
    it('suffixes both occurrences of a duplicate label with a stable, captureKey-derived tag', async () => {
        const { run, appendCsvToSheet } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Revenue',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        });

        await run();

        expect(appendCsvToSheet.mock.calls[0][3]).toBe('Revenue (c9ea)');
        expect(appendCsvToSheet.mock.calls[1][3]).toBe('Revenue (73b6)');
    });

    it('keeps duplicate-label tab names stable across a re-run with reversed item order', async () => {
        const forwardRun = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Revenue',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        });
        await forwardRun.run();

        // Same two items, reversed order and swapped `order` fields — as if
        // the app declared them in a different sequence on the next sync.
        const reversedRun = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Revenue',
                    queryUuid: 'query-b',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 1,
                }),
            ]),
        });
        await reversedRun.run();

        const forwardTabNames = forwardRun.appendCsvToSheet.mock.calls.map(
            (call) => call[3],
        );
        const reversedTabNames = reversedRun.appendCsvToSheet.mock.calls.map(
            (call) => call[3],
        );
        // query-a's tab name is identical whether it's processed first or
        // second, and likewise for query-b — the suffix tracks the query,
        // not its position in this run's list.
        expect(forwardTabNames).toEqual(['Revenue (c9ea)', 'Revenue (73b6)']);
        expect(reversedTabNames).toEqual(['Revenue (73b6)', 'Revenue (c9ea)']);
        expect(new Set(forwardTabNames)).toEqual(new Set(reversedTabNames));
    });

    it('keeps the plain sanitized name for a label that is unique this run, even when other labels collide', async () => {
        const { run, appendCsvToSheet } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Revenue',
                    queryUuid: 'query-b',
                    order: 1,
                }),
                readyItem({
                    captureKey: 'v1:c',
                    label: 'Orders',
                    queryUuid: 'query-c',
                    order: 2,
                }),
            ]),
        });

        await run();

        expect(appendCsvToSheet.mock.calls[2][3]).toBe('Orders');
    });

    // Manifest items already known to have failed at render time never get a
    // tab attempt — same as the dashboard branch pre-filtering chartTiles down
    // to tiles with a live savedChartUuid before it starts iterating.
    // A capture error is a runtime query failure (like a dashboard tile whose
    // query throws), not a missing widget — gsheets has no partial-failure
    // channel to report it silently, so any error item fails the whole sync
    // instead of shipping a "successful" run quietly missing that tab.
    it('fails the whole sync when the manifest contains any error items, naming them in the message', async () => {
        const { run, createNewTab, appendCsvToSheet, logSchedulerJob } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Revenue',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                errorItem({
                    captureKey: 'v1:err',
                    label: 'Broken query',
                    order: 1,
                }),
            ]),
        });

        await expect(run()).rejects.toThrow(/Broken query/);
        expect(createNewTab).not.toHaveBeenCalled();
        expect(appendCsvToSheet).not.toHaveBeenCalled();
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'error' }),
        );
    });

    it('names every error item when there is more than one', async () => {
        const { run } = setup({
            manifest: manifestOf([
                errorItem({
                    captureKey: 'v1:a',
                    label: 'Broken A',
                    order: 0,
                }),
                errorItem({
                    captureKey: 'v1:b',
                    label: 'Broken B',
                    order: 1,
                }),
            ]),
        });

        await expect(run()).rejects.toThrow(/Broken A.*Broken B/s);
    });

    it('throws when the capture render returns no items at all', async () => {
        const { run, createNewTab } = setup({
            manifest: manifestOf([]),
        });

        await expect(run()).rejects.toThrow(/captured no successful queries/i);
        expect(createNewTab).not.toHaveBeenCalled();
    });

    // Overflow queries are dropped silently at capture time — gsheets has no
    // partial-failure channel to report that, so a dropped query would
    // otherwise be missing a tab forever with nothing to say why.
    it('fails the whole sync when the capture manifest overflowed, naming the dropped count and the cap', async () => {
        const { run, createNewTab, appendCsvToSheet } = setup({
            manifest: manifestOf([readyItem()], 3),
        });

        await expect(run()).rejects.toThrow(
            new RegExp(`3 queries.*${MAX_DELIVERY_QUERIES}`, 's'),
        );
        expect(createNewTab).not.toHaveBeenCalled();
        expect(appendCsvToSheet).not.toHaveBeenCalled();
    });

    it('does not fail when the capture manifest has no overflow', async () => {
        const { run, appendCsvToSheet } = setup({
            manifest: manifestOf([readyItem()], 0),
        });

        await expect(run()).resolves.toBeUndefined();
        expect(appendCsvToSheet).toHaveBeenCalledTimes(1);
    });

    // Capture is fail-closed: a rejected render fails the whole gsheets task
    // and rides its existing retry/notify-and-disable path — no partial sync.
    it('fails the whole sync when the delivery capture render fails', async () => {
        const { run, createNewTab, appendCsvToSheet, logSchedulerJob } = setup({
            captureAppDeliveryManifest: vi
                .fn()
                .mockRejectedValue(
                    new Error('App delivery capture missing or malformed'),
                ),
        });

        await expect(run()).rejects.toThrow(
            /App delivery capture missing or malformed/i,
        );
        expect(createNewTab).not.toHaveBeenCalled();
        expect(appendCsvToSheet).not.toHaveBeenCalled();
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'error' }),
        );
    });

    // Any failure processing an attempted ready item (not a pre-known render
    // error) fails the whole sync too — matching the dashboard branch's
    // reduce().catch(rethrow), not the CSV app path's per-item partial
    // failures (gsheets has no notification payload to carry those through).
    it('fails the whole sync when a ready item fails during processing, and never attempts later items', async () => {
        const { run, appendCsvToSheet } = setup({
            manifest: manifestOf([
                readyItem({
                    captureKey: 'v1:a',
                    label: 'Fetched fine',
                    queryUuid: 'query-a',
                    order: 0,
                }),
                readyItem({
                    captureKey: 'v1:b',
                    label: 'Broken during fetch',
                    queryUuid: 'query-b',
                    order: 1,
                }),
                readyItem({
                    captureKey: 'v1:c',
                    label: 'Never attempted',
                    queryUuid: 'query-c',
                    order: 2,
                }),
            ]),
            getRawAsyncQueryResults: async ({ queryUuid }) => {
                if (queryUuid === 'query-b') {
                    throw new Error('results file missing');
                }
                return {
                    rows: [{ orders_id: 1 }],
                    fields: {},
                    displayTimezone: null,
                };
            },
        });

        await expect(run()).rejects.toThrow(/results file missing/i);
        // The first item's tab was already written before the second item
        // failed; sequential processing stops there and the third item is
        // never attempted.
        expect(appendCsvToSheet).toHaveBeenCalledTimes(1);
        expect(appendCsvToSheet.mock.calls[0][3]).toBe('Fetched fine');
    });

    // gaxios only retries when a request opts into `retry`/`retryConfig`,
    // which our calls never do — retryTransientGoogleSheetsWrite is the only
    // backoff a Google Sheets write gets, so the app branch's writes must go
    // through it the same as the ad-hoc gsheet export paths already do.
    it('retries a quota error on the sheet write and still completes the sync', async () => {
        const { run, appendCsvToSheet, logSchedulerJob } = setup({
            manifest: manifestOf([readyItem()]),
        });
        appendCsvToSheet
            .mockRejectedValueOnce(new GoogleSheetsQuotaError())
            .mockResolvedValueOnce(undefined);

        await run();

        expect(appendCsvToSheet).toHaveBeenCalledTimes(2);
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'completed' }),
        );
    });

    it('retries a quota error on the metadata write and still completes the sync', async () => {
        const { run, uploadMetadata, logSchedulerJob } = setup({
            manifest: manifestOf([readyItem()]),
        });
        uploadMetadata
            .mockRejectedValueOnce(new GoogleSheetsQuotaError())
            .mockResolvedValueOnce(undefined);

        await run();

        expect(uploadMetadata).toHaveBeenCalledTimes(2);
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'completed' }),
        );
    });

    // Proactive pacing (writes(N) = 3N + 3 vs GSHEETS_WRITES_PER_MINUTE_BUDGET)
    // — a large manifest bursting every write instantly would blow the
    // per-minute quota before any single write even fails, so item
    // processing is spaced apart up front rather than relying solely on
    // reactive retry.
    describe('write-quota pacing', () => {
        const manyReadyItems = (count: number) =>
            Array.from({ length: count }, (_, i) =>
                readyItem({
                    captureKey: `v1:item-${i}`,
                    label: `Query ${i}`,
                    queryUuid: `query-${i}`,
                    order: i,
                }),
            );

        it('adds zero pacing delay for a small manifest under the budget', async () => {
            vi.mocked(sleep).mockClear();
            const { run } = setup({
                manifest: manifestOf(manyReadyItems(2)),
            });

            await run();

            // 2 items -> 3*2+3=9 planned writes, nowhere near the 55 budget —
            // no retries either, so sleep should never be called at all.
            expect(vi.mocked(sleep)).not.toHaveBeenCalled();
        });

        it('engages pacing with the computed delay for a 20-query manifest', async () => {
            vi.mocked(sleep).mockClear();
            const { run } = setup({
                manifest: manifestOf(manyReadyItems(20)),
            });

            await run();

            // 20 items -> 3*20+3=63 planned writes, over the 55 budget.
            const expectedDelay = computeGsheetsPacingDelayMs(
                GSHEETS_WRITES_PER_APP_ITEM,
            );
            const pacingCalls = vi
                .mocked(sleep)
                .mock.calls.filter(([ms]) => ms === expectedDelay);
            // Pacing sleeps between items only: 19 gaps for 20 items.
            expect(pacingCalls).toHaveLength(19);
        });

        it('keeps the sustained write rate under budget for a 50-query manifest (MAX_DELIVERY_QUERIES)', async () => {
            vi.mocked(sleep).mockClear();
            const { run } = setup({
                manifest: manifestOf(manyReadyItems(50)),
            });

            await run();

            const expectedDelay = computeGsheetsPacingDelayMs(
                GSHEETS_WRITES_PER_APP_ITEM,
            );
            const pacingCalls = vi
                .mocked(sleep)
                .mock.calls.filter(([ms]) => ms === expectedDelay);
            expect(pacingCalls).toHaveLength(49);

            // The delay actually used keeps the sustained item-write rate at
            // or under the budget, by construction of the pacing formula.
            const sustainedWritesPerMinute =
                (60_000 / expectedDelay) * GSHEETS_WRITES_PER_APP_ITEM;
            expect(sustainedWritesPerMinute).toBeLessThanOrEqual(
                GSHEETS_WRITES_PER_MINUTE_BUDGET,
            );
        });
    });
});

describe('captureAppDeliveryQueries', () => {
    const setup = () => {
        const captureAppDeliveryManifest = vi
            .fn()
            .mockResolvedValue(manifestOf([readyItem()]));
        const task = makeTaskWithDeps({
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                headlessBrowser: {
                    internalLightdashHost: 'http://lightdash-dev:3000',
                },
            }),
            schedulerService: asDep<'schedulerService'>({
                appModel: {
                    findAppByUuid: vi.fn().mockResolvedValue(APP_ROW),
                },
            }),
            unfurlService: asDep<'unfurlService'>({
                captureAppDeliveryManifest,
            }),
        });
        return { task, captureAppDeliveryManifest };
    };

    const call = (task: SchedulerTask, scheduler: CreateSchedulerAndTargets) =>
        (
            task as unknown as {
                captureAppDeliveryQueries(
                    scheduler: CreateSchedulerAndTargets,
                    jobId: string,
                ): Promise<DeliveryCaptureManifest>;
            }
        ).captureAppDeliveryQueries(scheduler, 'job-9');

    it('renders the minimal app page in delivery capture mode', async () => {
        const { task, captureAppDeliveryManifest } = setup();

        const manifest = await call(task, appScheduler());

        expect(manifest.items).toHaveLength(1);
        const args = captureAppDeliveryManifest.mock.calls[0][0];
        expect(args.authUserUuid).toBe('user-1');
        expect(args.contextId).toBe('job-9');
        const url = new URL(args.url);
        expect(url.origin).toBe('http://lightdash-dev:3000');
        expect(url.pathname).toBe('/minimal/projects/project-1/apps/app-1');
        expect(url.searchParams.get('captureMode')).toBe('delivery');
        expect(url.searchParams.get('state')).toBeNull();
    });

    it('seeds the capture render with the scheduler app state', async () => {
        const { task, captureAppDeliveryManifest } = setup();

        await call(
            task,
            appScheduler({
                appState: { tab: 'revenue' },
            } as Partial<CreateSchedulerAndTargets>),
        );

        const url = new URL(captureAppDeliveryManifest.mock.calls[0][0].url);
        expect(url.searchParams.get('state')).toBe('{"tab":"revenue"}');
        expect(url.searchParams.get('captureMode')).toBe('delivery');
    });
});

describe('handleScheduledDelivery — app delivery capture', () => {
    const setup = ({
        manifest = manifestOf([readyItem()]),
        page,
    }: {
        manifest?: DeliveryCaptureManifest;
        page?: Partial<PageData>;
    } = {}) => {
        const captureAppDeliveryManifest = vi.fn().mockResolvedValue(manifest);
        const generateJobsForSchedulerTargets = vi.fn().mockResolvedValue([]);
        const track = vi.fn();
        const task = makeTaskWithDeps({
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                headlessBrowser: {
                    internalLightdashHost: 'http://lightdash-dev:3000',
                },
                persistentDownloadUrls: { expirationSeconds: 3600 },
            }),
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: vi.fn().mockResolvedValue(undefined),
                appModel: {
                    findAppByUuid: vi.fn().mockResolvedValue(APP_ROW),
                },
            }),
            organizationSettingsModel: asDep<'organizationSettingsModel'>({
                get: vi.fn().mockResolvedValue({
                    scheduledDeliveryExpirationSecondsEmail: 100,
                    scheduledDeliveryExpirationSecondsSlack: 200,
                    scheduledDeliveryExpirationSecondsMsTeams: null,
                    scheduledDeliveryExpirationSecondsGoogleChat: null,
                    scheduledDeliveryExpirationSeconds: null,
                }),
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({}),
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { id: 'user-id-1' },
                    organization: { organizationUuid: 'org-1' },
                }),
            }),
            analytics: asDep<'analytics'>({ track }),
            schedulerClient: asDep<'schedulerClient'>({
                generateJobsForSchedulerTargets,
            }),
            unfurlService: asDep<'unfurlService'>({
                captureAppDeliveryManifest,
            }),
        });
        const getNotificationPageData = vi.fn().mockResolvedValue({
            url: 'https://lightdash.example.com/app',
            details: { name: 'Sales App', description: undefined },
            pageType: 'app',
            organizationUuid: 'org-1',
            csvUrls: [],
            ...page,
        });
        (task as unknown as Record<string, unknown>).getNotificationPageData =
            getNotificationPageData;
        return {
            task,
            captureAppDeliveryManifest,
            getNotificationPageData,
            generateJobsForSchedulerTargets,
            track,
        };
    };

    const run = (task: SchedulerTask, scheduler: CreateSchedulerAndTargets) =>
        (
            task as unknown as {
                handleScheduledDelivery(
                    jobId: string,
                    scheduledTime: Date,
                    payload: ScheduledDeliveryPayload,
                    isFinalAttempt: boolean,
                ): Promise<void>;
            }
        ).handleScheduledDelivery(
            'job-1',
            new Date('2026-07-30T09:00:00Z'),
            {
                ...scheduler,
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            } as unknown as ScheduledDeliveryPayload,
            true,
        );

    test.each([
        new ForbiddenError(AGENT_SUMMARY_REFUSED_MESSAGE),
        new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
        new InvalidUser('Person is no longer in the organisation'),
    ])(
        'keeps the stored message and existing parent partial failure on %s',
        async (error) => {
            const { task, generateJobsForSchedulerTargets } = setup();
            Object.assign(task, {
                schedulerAiAugmentation: {
                    runForDelivery: vi.fn().mockRejectedValue(error),
                    assertDeliveryAllowed: vi.fn(),
                },
            });
            await run(
                task,
                appScheduler({
                    message: 'Stored message',
                    targets: [{ recipient: 'recipient@example.com' }],
                }),
            );
            const [, delivery, page, , , pages] =
                generateJobsForSchedulerTargets.mock.calls[0];
            expect(delivery.message).toBe('Stored message');
            expect(page.failures).toContainEqual({
                type: PartialFailureType.AI_AUGMENTATION,
                error: error.message,
            });
            expect(pages.email.failures).toEqual(page.failures);
        },
    );

    test.each(['Stored message', undefined])(
        'passes summary authority and original message %s to fanout',
        async (message) => {
            const { task, generateJobsForSchedulerTargets } = setup();
            const marker = {
                userUuid: 'execution-user',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            };
            const runForDelivery = vi.fn().mockResolvedValue({
                message: 'AI summary',
                agentWork: marker,
            });
            Object.assign(task, {
                schedulerAiAugmentation: {
                    runForDelivery,
                    assertDeliveryAllowed: vi.fn(),
                },
            });
            await run(
                task,
                appScheduler({
                    createdBy: 'execution-user',
                    message,
                    targets: [{ recipient: 'recipient@example.com' }],
                }),
            );
            expect(runForDelivery).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: 'execution-user' }),
            );
            expect(
                generateJobsForSchedulerTargets.mock.calls[0][1].message,
            ).toBe('AI summary');
            expect(generateJobsForSchedulerTargets.mock.calls[0][6]).toEqual({
                agentWork: marker,
                aiSummaryOriginalMessage: message ?? null,
            });
        },
    );

    test.each([null, { message: 'Summary without checks', agentWork: null }])(
        'does not pass child authority for %j',
        async (summary) => {
            const { task, generateJobsForSchedulerTargets } = setup();
            Object.assign(task, {
                schedulerAiAugmentation: {
                    runForDelivery: vi.fn().mockResolvedValue(summary),
                    assertDeliveryAllowed: vi.fn(),
                },
            });
            await run(
                task,
                appScheduler({
                    message: 'Stored message',
                    targets: [{ recipient: 'recipient@example.com' }],
                }),
            );
            expect(
                generateJobsForSchedulerTargets.mock.calls[0][1].message,
            ).toBe(summary?.message ?? 'Stored message');
            expect(
                generateJobsForSchedulerTargets.mock.calls[0][6],
            ).toBeUndefined();
        },
    );

    test('marks a saved delivery with its execution user rather than its owner or trace user', async () => {
        const { task, generateJobsForSchedulerTargets } = setup();
        const marker = {
            userUuid: 'execution-user',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
        };
        const runForDelivery = vi
            .fn()
            .mockResolvedValue({ message: 'AI summary', agentWork: marker });
        Object.assign(task, {
            schedulerAiAugmentation: {
                runForDelivery,
                assertDeliveryAllowed: vi.fn(),
            },
        });
        Object.assign(task['schedulerService'], {
            schedulerModel: {
                getSchedulerAndTargets: vi.fn().mockResolvedValue({
                    ...appScheduler({
                        createdBy: 'owner',
                        message: 'Stored message',
                        targets: [{ recipient: 'recipient@example.com' }],
                    }),
                    schedulerUuid: 'scheduler-1',
                }),
            },
        });
        await task['handleScheduledDelivery'](
            'job-1',
            new Date('2026-07-30T09:00:00Z'),
            {
                schedulerUuid: 'scheduler-1',
                userUuid: 'trace-user',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                executionUserUuid: 'execution-user',
            },
            true,
        );
        expect(runForDelivery).toHaveBeenCalledWith(
            expect.objectContaining({ createdBy: 'execution-user' }),
        );
        expect(generateJobsForSchedulerTargets.mock.calls[0][4].userUuid).toBe(
            'trace-user',
        );
        expect(generateJobsForSchedulerTargets.mock.calls[0][6]).toEqual({
            agentWork: marker,
            aiSummaryOriginalMessage: 'Stored message',
        });
    });

    // Bookkeeping runs after the notification jobs are queued, so a throw
    // there must not fail the job — with maxAttempts > 1 the retry would queue
    // a second set of them and recipients would get the delivery twice.
    it('completes without rethrowing when post-enqueue bookkeeping fails', async () => {
        const generateJobsForSchedulerTargets = vi
            .fn()
            .mockResolvedValue([
                { target: 'a@b.com', jobId: 'target-job-1', type: 'email' },
            ]);
        const track = vi.fn();
        const logSchedulerJob = vi
            .fn()
            .mockResolvedValueOnce(undefined) // STARTED
            .mockRejectedValue(new Error('scheduler log write failed'));
        const task = makeTaskWithDeps({
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                headlessBrowser: {
                    internalLightdashHost: 'http://lightdash-dev:3000',
                },
                persistentDownloadUrls: { expirationSeconds: 3600 },
            }),
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob,
                appModel: {
                    findAppByUuid: vi.fn().mockResolvedValue(APP_ROW),
                },
            }),
            organizationSettingsModel: asDep<'organizationSettingsModel'>({
                get: vi.fn().mockResolvedValue({}),
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: vi.fn().mockResolvedValue({}),
                getAccountByUserUuid: vi.fn().mockResolvedValue({
                    user: { id: 'user-id-1' },
                    organization: { organizationUuid: 'org-1' },
                }),
            }),
            analytics: asDep<'analytics'>({ track }),
            schedulerClient: asDep<'schedulerClient'>({
                generateJobsForSchedulerTargets,
            }),
            unfurlService: asDep<'unfurlService'>({
                captureAppDeliveryManifest: vi
                    .fn()
                    .mockResolvedValue(manifestOf([readyItem()])),
            }),
        });
        (task as unknown as Record<string, unknown>).getNotificationPageData =
            vi.fn().mockResolvedValue({
                url: 'https://lightdash.example.com/app',
                details: { name: 'Sales App', description: undefined },
                pageType: 'app',
                organizationUuid: 'org-1',
                csvUrls: [],
            });

        await expect(
            run(task, appScheduler({ targets: [{ recipient: 'a@b.com' }] })),
        ).resolves.toBeUndefined();

        // The retry budget must only cover the pre-enqueue phase.
        expect(generateJobsForSchedulerTargets).toHaveBeenCalledTimes(1);
        expect(
            track.mock.calls.some(
                ([event]) => event.event === 'scheduler_job.failed',
            ),
        ).toBe(false);
    });

    it('captures the app render exactly once across two expiration groups', async () => {
        const { task, captureAppDeliveryManifest, getNotificationPageData } =
            setup();

        await run(
            task,
            appScheduler({
                targets: [{ recipient: 'a@b.com' }, { channel: 'C123' }],
            }),
        );

        expect(getNotificationPageData).toHaveBeenCalledTimes(2);
        expect(captureAppDeliveryManifest).toHaveBeenCalledTimes(1);
        const manifests = getNotificationPageData.mock.calls.map(
            (call) => call[5],
        );
        expect(manifests[0]).toBeDefined();
        expect(manifests[0]).toBe(manifests[1]);
    });

    it('does not capture for an image-format app delivery', async () => {
        const { task, captureAppDeliveryManifest, getNotificationPageData } =
            setup();

        await run(
            task,
            appScheduler({
                format: SchedulerFormat.IMAGE,
                options: {},
                targets: [{ recipient: 'a@b.com' }],
            }),
        );

        expect(captureAppDeliveryManifest).not.toHaveBeenCalled();
        expect(getNotificationPageData.mock.calls[0][5]).toBeUndefined();
    });

    it('does not capture for a dashboard CSV delivery', async () => {
        const { task, captureAppDeliveryManifest } = setup();

        await run(
            task,
            appScheduler({
                appUuid: null,
                appName: null,
                dashboardUuid: 'dashboard-1',
                targets: [{ recipient: 'a@b.com' }],
            }),
        );

        expect(captureAppDeliveryManifest).not.toHaveBeenCalled();
    });

    const completedEvent = (track: Mock) =>
        track.mock.calls
            .map(([event]) => event)
            .find(
                (event: { event: string }) =>
                    event.event === 'scheduler_job.completed',
            );

    it('describes the app delivery payload on the completed event', async () => {
        const { task, track } = setup({
            manifest: manifestOf(
                [readyItem(), readyItem({ order: 1 }), errorItem()],
                2,
            ),
            page: {
                csvUrls: [
                    {
                        filename: 'csv-Revenue.csv',
                        path: 'https://files.example.com/revenue.csv',
                        localPath: 'https://files.example.com/revenue.csv',
                        chartName: 'Revenue',
                        truncated: false,
                    },
                ],
                failures: [
                    {
                        type: PartialFailureType.APP_QUERY,
                        stage: 'render',
                        captureKey: 'v1:key-err',
                        label: 'Broken query',
                        error: 'Query timed out',
                    },
                    {
                        type: PartialFailureType.APP_QUERY,
                        stage: 'download',
                        captureKey: 'v1:key-1',
                        label: 'Orders',
                        error: 'storage unavailable',
                    },
                ],
                notices: [
                    {
                        type: 'limit_reached',
                        label: 'Sessions',
                        rowCount: 5000,
                    },
                ],
            },
        });

        await run(task, appScheduler({ targets: [{ recipient: 'a@b.com' }] }));

        expect(completedEvent(track).properties).toMatchObject({
            capturedQueryCount: 3,
            deliveredFileCount: 1,
            renderFailureCount: 1,
            downloadFailureCount: 1,
            noticeCount: 1,
            captureOverflow: true,
        });
    });

    it('omits the app delivery counts for a non-app delivery', async () => {
        const { task, track } = setup();

        await run(
            task,
            appScheduler({
                appUuid: null,
                appName: null,
                dashboardUuid: 'dashboard-1',
                targets: [{ recipient: 'a@b.com' }],
            }),
        );

        expect(completedEvent(track).properties).not.toHaveProperty(
            'capturedQueryCount',
        );
    });
});

describe('app delivery target senders', () => {
    const senderPage = (
        overrides: Partial<PageData> = {},
    ): PageData & { notices?: PageData['notices'] } => ({
        url: 'https://lightdash.example.com/projects/project-1/apps/app-1/view',
        details: { name: 'Sales App', description: 'Sales overview' },
        pageType: LightdashPage.APP,
        organizationUuid: 'org-1',
        csvUrls: [
            {
                filename: 'csv-Revenue-2026-07-30.csv',
                path: 'https://files.example.com/revenue.csv',
                localPath: 'https://files.example.com/revenue.csv',
                chartName: 'Revenue',
                truncated: false,
            },
        ],
        failures: [
            {
                type: PartialFailureType.APP_QUERY,
                stage: 'download',
                captureKey: 'v1:b',
                label: 'Orders',
                error: 'storage unavailable',
            },
        ],
        notices: [{ type: 'limit_reached', label: 'Sessions', rowCount: 5000 }],
        ...overrides,
    });

    const senderBaseDeps = (): Partial<TaskDeps> => ({
        analytics: asDep<'analytics'>({ track: vi.fn() }),
        schedulerService: asDep<'schedulerService'>({
            logSchedulerJob: vi.fn().mockResolvedValue(undefined),
            getSchedulerDefaultTimezone: vi.fn().mockResolvedValue('UTC'),
        }),
        organizationSettingsModel: asDep<'organizationSettingsModel'>({
            get: vi.fn().mockResolvedValue({}),
        }),
        lightdashConfig: asDep<'lightdashConfig'>({
            siteUrl: 'https://lightdash.example.com',
            persistentDownloadUrls: { expirationSeconds: 604800 },
        }),
    });

    const notificationOf = (
        scheduler: CreateSchedulerAndTargets,
        page: PageData,
        target: Record<string, string>,
    ) =>
        ({
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'user-1',
            scheduledTime: new Date('2026-07-30T09:00:00Z'),
            jobGroup: 'job-1',
            scheduler,
            page,
            ...target,
        }) as unknown as never;

    const sendMethods = [
        'sendSlackNotification',
        'sendEmailNotification',
        'sendMsTeamsNotification',
        'sendGoogleChatNotification',
        'sendSlackBatchNotification',
        'sendEmailBatchNotification',
        'sendMsTeamsBatchNotification',
        'sendGoogleChatBatchNotification',
    ] as const;

    const setupSummarySender = () => {
        const calls: string[] = [];
        const send = vi.fn(async (..._args: unknown[]) => {
            calls.push('send');
            return { ts: '111' };
        });
        const check = vi.fn(async () => {
            calls.push('check');
        });
        const person = vi.fn();
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            schedulerAiAugmentation: asDep<'schedulerAiAugmentation'>({
                runForDelivery: vi.fn(),
                assertDeliveryAllowed: check,
            }),
            userService: asDep<'userService'>({
                getSessionByUserUuid: person,
                getAccountByUserUuid: person,
            }),
            analytics: asDep<'analytics'>({
                track: ({ event }: { event: string }) => calls.push(event),
            }),
            schedulerService: asDep<'schedulerService'>({
                logSchedulerJob: async ({ status }: { status: string }) => {
                    calls.push(`log:${status}`);
                },
                getSchedulerDefaultTimezone: async () => {
                    calls.push('timezone');
                    return 'UTC';
                },
            }),
            organizationSettingsModel: asDep<'organizationSettingsModel'>({
                get: async () => {
                    calls.push('settings');
                    return {};
                },
            }),
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://example.com',
                persistentDownloadUrls: { expirationSeconds: 604800 },
                microsoftTeams: { enabled: true },
            }),
            slackClient: asDep<'slackClient'>({
                isEnabled: true,
                postMessage: send,
            }),
            emailClient: asDep<'emailClient'>({
                sendDashboardCsvNotificationEmail: send,
            }),
            emailWhitelabelService: asDep<'emailWhitelabelService'>({
                resolveSenderIdentity: async () => {
                    calls.push('sender');
                    return null;
                },
            }),
            msTeamsClient: asDep<'msTeamsClient'>({
                postCsvsWithWebhook: send,
            }),
            googleChatClient: asDep<'googleChatClient'>({
                postCsvsWithWebhook: send,
            }),
        });
        const target = {
            channel: 'C123',
            recipient: 'recipient@example.com',
            webhook: 'https://example.com/teams',
            googleChatWebhook: 'https://example.com/chat',
        };
        const payload = {
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'trace-user',
            schedulerUuid: 'scheduler-1',
            scheduledTime: new Date('2026-07-30T09:00:00Z'),
            jobGroup: 'job-1',
            scheduler: {
                ...appScheduler({ message: 'Generated report text' }),
                schedulerUuid: 'scheduler-1',
            },
            page: senderPage({ failures: [] }),
            targets: [target],
            ...target,
        };
        return { task, calls, send, check, person, payload };
    };

    describe.each(sendMethods)('%s summary authority', (method) => {
        test.each([
            'allowed',
            'refused',
            'error',
            'malformed',
            'null message',
            'missing runner',
            'wrong organisation',
            'wrong project',
        ])(
            '%s still delivers and selects the safe message',
            async (scenario) => {
                const { task, send, check, payload } = setupSummarySender();
                const refusal = new AiAccessRefusedError(
                    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                );
                const marker = {
                    userUuid: 'execution-user',
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                };
                if (scenario === 'refused' || scenario === 'null message')
                    check.mockRejectedValue(refusal);
                if (scenario === 'error')
                    check.mockRejectedValue(
                        new Error('private connection detail'),
                    );
                if (scenario === 'missing runner')
                    Object.assign(task, { schedulerAiAugmentation: undefined });
                const notification = {
                    ...payload,
                    agentWork:
                        scenario === 'malformed'
                            ? null
                            : {
                                  ...marker,
                                  ...(scenario === 'wrong organisation'
                                      ? { organizationUuid: 'other' }
                                      : {}),
                                  ...(scenario === 'wrong project'
                                      ? { projectUuid: 'other' }
                                      : {}),
                              },
                    aiSummaryOriginalMessage:
                        scenario === 'null message' ? null : 'Stored message',
                };
                const result = await task[method](
                    'job-1',
                    notification as never,
                );
                if (method.includes('Batch'))
                    expect(result).toMatchObject({ failed: 0, succeeded: 1 });
                expect(send).toHaveBeenCalledOnce();
                const output = JSON.stringify(send.mock.calls);
                expect(output).not.toContain('private connection detail');
                if (scenario === 'allowed') {
                    expect(check).toHaveBeenCalledWith(marker);
                    expect(output).toContain('Generated report text');
                    expect(output).not.toContain('Stored message');
                } else {
                    expect(output).not.toContain('Generated report text');
                    if (scenario === 'null message')
                        expect(output).not.toContain('Stored message');
                    else expect(output).toContain('Stored message');
                    const failureText =
                        scenario === 'refused' || scenario === 'null message'
                            ? AGENT_SUMMARY_REFUSED_MESSAGE
                            : 'The summary could not be verified.';
                    expect(output).not.toContain(refusal.message);
                    expect(output).toContain(
                        method.includes('Slack')
                            ? 'AI summary could not be generated'
                            : failureText,
                    );
                }
                expect(notification.scheduler.message).toBe(
                    'Generated report text',
                );
                expect(notification.page.failures).toEqual([]);
            },
        );
    });

    test.each(sendMethods)(
        '%s preserves no-marker calls and synchronous start',
        async (method) => {
            const { task, calls, send, check, person, payload } =
                setupSummarySender();
            const pending = task[method]('job-1', payload as never);
            expect(calls).toEqual([
                'scheduler_notification_job.started',
                'log:started',
            ]);
            await pending;
            const single = [
                'scheduler_notification_job.started',
                'log:started',
                'settings',
                'timezone',
                ...(method.includes('Email') ? ['sender'] : []),
                'send',
                'scheduler_notification_job.completed',
                'log:completed',
            ];
            expect(calls).toEqual(
                method.includes('Batch')
                    ? [
                          'scheduler_notification_job.started',
                          'log:started',
                          ...single,
                          'scheduler_notification_job.completed',
                          'log:completed',
                      ]
                    : single,
            );
            expect(send).toHaveBeenCalledOnce();
            expect(check).not.toHaveBeenCalled();
            expect(person).not.toHaveBeenCalled();
        },
    );

    it('posts an app csv delivery to Slack with the files and the limit notice', async () => {
        const postMessage = vi.fn().mockResolvedValue({ ts: '111' });
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            slackClient: asDep<'slackClient'>({ isEnabled: true, postMessage }),
        });
        const page = senderPage();

        await (
            task as unknown as {
                sendSlackNotification(
                    jobId: string,
                    notification: never,
                ): Promise<void>;
            }
        ).sendSlackNotification(
            'job-1',
            notificationOf(appScheduler(), page, { channel: 'C123' }),
        );

        expect(postMessage).toHaveBeenCalledTimes(1);
        const blocks = JSON.stringify(postMessage.mock.calls[0][0].blocks);
        // Recipients see the query label, not the timestamped download name.
        expect(blocks).toContain(':black_small_square: Revenue');
        expect(blocks).not.toContain('csv-Revenue-2026-07-30.csv');
        expect(blocks).toContain(
            'Sessions reached its query limit; additional rows may exist (5000 rows delivered)',
        );
        expect(blocks).toContain('Orders');
    });

    describe('csv file attachments in the Slack thread', () => {
        const sendToSlack = async (
            scheduler: CreateSchedulerAndTargets,
            page: PageData,
        ) => {
            const postMessage = vi.fn().mockResolvedValue({ ts: '111' });
            const postFileToThread = vi.fn().mockResolvedValue(undefined);
            const task = makeTaskWithDeps({
                ...senderBaseDeps(),
                slackClient: asDep<'slackClient'>({
                    isEnabled: true,
                    postMessage,
                    postFileToThread,
                }),
            });
            await (
                task as unknown as {
                    sendSlackNotification(
                        jobId: string,
                        notification: never,
                    ): Promise<void>;
                }
            ).sendSlackNotification(
                'job-1',
                notificationOf(scheduler, page, { channel: 'C123' }),
            );
            return { postMessage, postFileToThread };
        };

        const attachingScheduler = (
            overrides: Partial<CreateSchedulerAndTargets> = {},
        ) =>
            appScheduler({
                options: {
                    formatted: true,
                    limit: 'table',
                    asAttachment: true,
                },
                ...overrides,
            });

        beforeEach(() => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async (url: string) =>
                    url.includes('missing')
                        ? new Response('gone', { status: 404 })
                        : new Response(`rows from ${url}`),
                ),
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('uploads every csv file into the thread of the delivery message', async () => {
            const page = senderPage({
                csvUrls: [
                    {
                        filename: 'csv-Revenue-2026-07-30.csv',
                        path: 'https://files.example.com/revenue.csv?sig=1',
                        localPath: 'https://files.example.com/revenue.csv',
                        chartName: 'Revenue',
                        truncated: false,
                    },
                    {
                        filename: 'csv-Orders-2026-07-30.csv',
                        path: 'https://files.example.com/orders.csv?sig=1',
                        localPath: 'https://files.example.com/orders.csv',
                        chartName: 'Orders',
                        truncated: false,
                    },
                ],
            });

            const { postFileToThread } = await sendToSlack(
                attachingScheduler(),
                page,
            );

            expect(postFileToThread).toHaveBeenCalledTimes(2);
            const [first, second] = postFileToThread.mock.calls.map(
                (call) => call[0],
            );
            expect(first).toMatchObject({
                organizationUuid: 'org-1',
                channelId: 'C123',
                threadTs: '111',
                filename: 'csv-Revenue-2026-07-30.csv',
                title: 'Revenue',
                fileType: 'csv',
            });
            expect(first.file.toString()).toBe(
                'rows from https://files.example.com/revenue.csv',
            );
            expect(second.filename).toBe('csv-Orders-2026-07-30.csv');
        });

        it('adds the csv extension to dashboard files that are named after their chart', async () => {
            const page = senderPage({
                csvUrls: [
                    {
                        filename: 'Revenue by method?',
                        path: 'https://files.example.com/revenue.csv?sig=1',
                        localPath: 'https://files.example.com/revenue.csv',
                        chartName: 'Revenue by method?',
                        truncated: false,
                    },
                ],
            });

            const { postFileToThread } = await sendToSlack(
                attachingScheduler(),
                page,
            );

            expect(postFileToThread.mock.calls[0][0]).toMatchObject({
                filename: 'Revenue by method?.csv',
                title: 'Revenue by method?',
            });
        });

        it('uploads the chart csv with the chart name as the file title', async () => {
            const page = senderPage({
                pageType: LightdashPage.CHART,
                details: { name: 'Revenue by method', description: '' },
                csvUrls: undefined,
                failures: undefined,
                notices: undefined,
                csvUrl: {
                    filename: 'csv-Revenue-by-method-2026-07-30.csv',
                    path: 'https://files.example.com/revenue.csv?sig=1',
                    localPath: 'https://files.example.com/revenue.csv',
                    truncated: false,
                },
            });

            const { postFileToThread } = await sendToSlack(
                attachingScheduler({
                    appUuid: null,
                    appName: null,
                    savedChartUuid: 'chart-1',
                }),
                page,
            );

            expect(postFileToThread).toHaveBeenCalledTimes(1);
            expect(postFileToThread.mock.calls[0][0]).toMatchObject({
                threadTs: '111',
                filename: 'csv-Revenue-by-method-2026-07-30.csv',
                title: 'Revenue by method',
            });
        });

        it('keeps the link-only message when the attachment option is off', async () => {
            const { postMessage, postFileToThread } = await sendToSlack(
                appScheduler(),
                senderPage(),
            );

            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postFileToThread).not.toHaveBeenCalled();
        });

        it('uploads xlsx files typed as xlsx', async () => {
            const page = senderPage({
                csvUrls: [
                    {
                        filename: 'Revenue',
                        path: 'https://files.example.com/revenue.xlsx?sig=1',
                        localPath: 'https://files.example.com/revenue.xlsx',
                        chartName: 'Revenue',
                        truncated: false,
                    },
                ],
            });

            const { postFileToThread } = await sendToSlack(
                attachingScheduler({ format: SchedulerFormat.XLSX }),
                page,
            );

            expect(postFileToThread).toHaveBeenCalledTimes(1);
            expect(postFileToThread.mock.calls[0][0]).toMatchObject({
                filename: 'Revenue.xlsx',
                title: 'Revenue',
                fileType: 'xlsx',
            });
        });

        it('uploads the single workbook when the dashboard xlsx layout is workbook', async () => {
            const page = senderPage({
                csvUrls: [
                    {
                        filename: 'Sales App',
                        path: 'https://files.example.com/workbook.xlsx?sig=1',
                        localPath: 'https://files.example.com/workbook.xlsx',
                        truncated: false,
                    },
                ],
            });

            const { postFileToThread } = await sendToSlack(
                attachingScheduler({
                    format: SchedulerFormat.XLSX,
                    options: {
                        formatted: true,
                        limit: 'table',
                        asAttachment: true,
                        xlsxFileLayout: 'workbook',
                    },
                }),
                page,
            );

            expect(postFileToThread).toHaveBeenCalledTimes(1);
            expect(postFileToThread.mock.calls[0][0]).toMatchObject({
                filename: 'Sales App.xlsx',
                title: 'Sales App',
                fileType: 'xlsx',
            });
        });

        it('skips empty results and carries on after a file that fails to download', async () => {
            const page = senderPage({
                csvUrls: [
                    {
                        filename: 'csv-Empty-2026-07-30.csv',
                        path: '#no-results',
                        localPath: '#no-results',
                        chartName: 'Empty',
                        truncated: false,
                    },
                    {
                        filename: 'csv-Missing-2026-07-30.csv',
                        path: 'https://files.example.com/missing.csv?sig=1',
                        localPath: 'https://files.example.com/missing.csv',
                        chartName: 'Missing',
                        truncated: false,
                    },
                    {
                        filename: 'csv-Orders-2026-07-30.csv',
                        path: 'https://files.example.com/orders.csv?sig=1',
                        localPath: 'https://files.example.com/orders.csv',
                        chartName: 'Orders',
                        truncated: false,
                    },
                ],
            });

            const { postMessage, postFileToThread } = await sendToSlack(
                attachingScheduler(),
                page,
            );

            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postFileToThread).toHaveBeenCalledTimes(1);
            expect(postFileToThread.mock.calls[0][0].filename).toBe(
                'csv-Orders-2026-07-30.csv',
            );
        });
    });

    it('sends an app csv delivery by email with its failures and notices', async () => {
        const sendDashboardCsvNotificationEmail = vi
            .fn()
            .mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            emailClient: asDep<'emailClient'>({
                sendDashboardCsvNotificationEmail,
            }),
            emailWhitelabelService: asDep<'emailWhitelabelService'>({
                resolveSenderIdentity: vi.fn().mockResolvedValue(null),
            }),
        });
        const page = senderPage();

        await (
            task as unknown as {
                sendEmailNotification(
                    jobId: string,
                    notification: never,
                ): Promise<void>;
            }
        ).sendEmailNotification(
            'job-1',
            notificationOf(appScheduler(), page, {
                recipient: 'recipient@example.com',
            }),
        );

        expect(sendDashboardCsvNotificationEmail).toHaveBeenCalledTimes(1);
        const args = sendDashboardCsvNotificationEmail.mock.calls[0];
        expect(args[0]).toBe('recipient@example.com');
        expect(args[7]).toEqual(page.csvUrls);
        expect(args[14]).toEqual(page.failures);
        expect(args[15]).toEqual(page.notices);
        // isApp — drives the app-aware headline in the template.
        expect(args[17]).toBe(true);
    });

    it('sends an inline plain-text dashboard email without a cron', async () => {
        const sendDashboardCsvNotificationEmail = vi
            .fn()
            .mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            emailClient: asDep<'emailClient'>({
                sendDashboardCsvNotificationEmail,
            }),
            emailWhitelabelService: asDep<'emailWhitelabelService'>({
                resolveSenderIdentity: vi.fn().mockResolvedValue(null),
            }),
        });
        const scheduler: SendNowScheduler = {
            ...appScheduler({
                appUuid: null,
                appName: null,
                dashboardUuid: 'dashboard-1',
                plainTextEmail: true,
            }),
            savedChartUuid: null,
            dashboardUuid: 'dashboard-1',
            savedSqlUuid: null,
            appUuid: null,
            cron: undefined,
            selectedTabs: null,
        };

        const notification: EmailNotificationPayload = {
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'user-1',
            scheduledTime: new Date('2026-07-30T09:00:00Z'),
            jobGroup: 'job-1',
            scheduler,
            page: senderPage(),
            recipient: 'recipient@example.com',
        };

        await task.sendEmailNotificationForTest('job-1', notification);

        expect(sendDashboardCsvNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendDashboardCsvNotificationEmail.mock.calls[0][18]).toEqual({
            cadence: undefined,
        });
    });

    it('posts an app xlsx delivery to the MS Teams webhook', async () => {
        const postCsvsWithWebhook = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            lightdashConfig: asDep<'lightdashConfig'>({
                siteUrl: 'https://lightdash.example.com',
                persistentDownloadUrls: { expirationSeconds: 604800 },
                microsoftTeams: { enabled: true },
            }),
            msTeamsClient: asDep<'msTeamsClient'>({ postCsvsWithWebhook }),
        });
        const page = senderPage();

        await (
            task as unknown as {
                sendMsTeamsNotification(
                    jobId: string,
                    notification: never,
                ): Promise<void>;
            }
        ).sendMsTeamsNotification(
            'job-1',
            notificationOf(
                appScheduler({ format: SchedulerFormat.XLSX }),
                page,
                { webhook: 'https://webhook.example.com/teams' },
            ),
        );

        expect(postCsvsWithWebhook).toHaveBeenCalledTimes(1);
        expect(postCsvsWithWebhook.mock.calls[0][0]).toMatchObject({
            webhookUrl: 'https://webhook.example.com/teams',
            csvUrls: page.csvUrls,
            failures: page.failures,
            notices: page.notices,
        });
    });

    it('posts a dashboard xlsx delivery to the Google Chat webhook', async () => {
        const postCsvsWithWebhook = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            googleChatClient: asDep<'googleChatClient'>({
                postCsvsWithWebhook,
            }),
        });
        const page = senderPage({ pageType: LightdashPage.DASHBOARD });

        await (
            task as unknown as {
                sendGoogleChatNotification(
                    jobId: string,
                    notification: never,
                ): Promise<void>;
            }
        ).sendGoogleChatNotification(
            'job-1',
            notificationOf(
                appScheduler({
                    format: SchedulerFormat.XLSX,
                    appUuid: null,
                    appName: null,
                    dashboardUuid: 'dashboard-1',
                }),
                page,
                { googleChatWebhook: 'https://webhook.example.com/chat' },
            ),
        );

        expect(postCsvsWithWebhook).toHaveBeenCalledTimes(1);
        expect(postCsvsWithWebhook.mock.calls[0][0]).toMatchObject({
            webhookUrl: 'https://webhook.example.com/chat',
            csvUrls: page.csvUrls,
        });
    });

    it('posts an app xlsx delivery to the Google Chat webhook', async () => {
        const postCsvsWithWebhook = vi.fn().mockResolvedValue(undefined);
        const task = makeTaskWithDeps({
            ...senderBaseDeps(),
            googleChatClient: asDep<'googleChatClient'>({
                postCsvsWithWebhook,
            }),
        });
        const page = senderPage();

        await (
            task as unknown as {
                sendGoogleChatNotification(
                    jobId: string,
                    notification: never,
                ): Promise<void>;
            }
        ).sendGoogleChatNotification(
            'job-1',
            notificationOf(
                appScheduler({ format: SchedulerFormat.XLSX }),
                page,
                { googleChatWebhook: 'https://webhook.example.com/chat' },
            ),
        );

        expect(postCsvsWithWebhook).toHaveBeenCalledTimes(1);
        expect(postCsvsWithWebhook.mock.calls[0][0]).toMatchObject({
            webhookUrl: 'https://webhook.example.com/chat',
            csvUrls: page.csvUrls,
            failures: page.failures,
            notices: page.notices,
        });
    });
});

describe('dashboard export download filenames', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const callCreateZipDownloadUrl = (
        task: SchedulerTask,
        zipNameBase: string,
    ) =>
        (
            task as unknown as {
                createZipDownloadUrl: (args: {
                    files: { entryNameBase: string; localPath: string }[];
                    fileType: SchedulerFormat.CSV | SchedulerFormat.XLSX;
                    zipNameBase: string;
                    organizationUuid: string;
                    projectUuid: string;
                    createdByUserUuid: string | null;
                    accessMode: PersistentDownloadFileAccessMode;
                }) => Promise<string>;
            }
        ).createZipDownloadUrl({
            files: [
                {
                    entryNameBase: 'Revenue',
                    localPath: 'https://files.example.com/revenue.csv',
                },
            ],
            fileType: SchedulerFormat.CSV,
            zipNameBase,
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
            accessMode: PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
        });

    it('uploads the zip with the dashboard name as the download filename', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('a,b\n1,2\n')),
        );
        const uploadZip = vi
            .fn()
            .mockResolvedValue('https://files.example.com/export.zip');
        const task = makeTaskWithDeps({
            fileStorageClient: asDep<'fileStorageClient'>({
                isEnabled: () => true,
                uploadZip,
            }),
            persistentDownloadFileService:
                asDep<'persistentDownloadFileService'>({
                    createPersistentUrl: vi
                        .fn()
                        .mockResolvedValue(
                            'https://lightdash.example.com/api/v1/file/abc',
                        ),
                }),
        });

        await callCreateZipDownloadUrl(task, 'Q3 Revenue / Costs');

        expect(uploadZip).toHaveBeenCalledTimes(1);
        const [, storageKey, attachmentDownloadName] = uploadZip.mock.calls[0];
        expect(attachmentDownloadName).toBe('Q3 Revenue / Costs.zip');
        expect(storageKey).not.toContain('/');
        expect(storageKey).toMatch(/\.zip$/);
        expect(storageKey).not.toBe(attachmentDownloadName);
    });

    it('uploads the workbook with the dashboard name as the download filename', async () => {
        vi.spyOn(WorkbookExportHelper, 'createWorkbookFile').mockResolvedValue({
            worksheetCount: 2,
            failedFileCount: 0,
        });
        const uploadExcel = vi
            .fn()
            .mockResolvedValue('https://files.example.com/workbook.xlsx');
        const task = makeTaskWithDeps({
            fileStorageClient: asDep<'fileStorageClient'>({
                isEnabled: () => true,
                uploadExcel,
            }),
            persistentDownloadFileService:
                asDep<'persistentDownloadFileService'>({
                    createPersistentUrl: vi
                        .fn()
                        .mockResolvedValue(
                            'https://lightdash.example.com/api/v1/file/abc',
                        ),
                }),
        });

        await (
            task as unknown as {
                createWorkbookDownloadUrl: (args: {
                    files: {
                        filename: string;
                        path: string;
                        localPath: string;
                        truncated: boolean;
                    }[];
                    workbookNameBase: string;
                    organizationUuid: string;
                    projectUuid: string;
                    createdByUserUuid: string;
                    accessMode: PersistentDownloadFileAccessMode;
                }) => Promise<{ url: string; numFileFailures: number }>;
            }
        ).createWorkbookDownloadUrl({
            files: [
                {
                    filename: 'Revenue',
                    path: 'https://files.example.com/revenue.xlsx',
                    localPath: '/tmp/revenue.xlsx',
                    truncated: false,
                },
            ],
            workbookNameBase: 'Q3 Revenue / Costs',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            createdByUserUuid: 'user-1',
            accessMode: PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
        });

        expect(uploadExcel).toHaveBeenCalledTimes(1);
        const [, storageKey, attachmentDownloadName] =
            uploadExcel.mock.calls[0];
        expect(attachmentDownloadName).toBe('Q3 Revenue / Costs.xlsx');
        // The key stays storage-safe and timestamped, so it must differ.
        expect(storageKey).not.toContain('/');
        expect(storageKey).toMatch(/\.xlsx$/);
        expect(storageKey).not.toBe(attachmentDownloadName);
    });
});

describe('connection compile jobs', () => {
    beforeEach(() => vi.stubEnv('IS_PULL_REQUEST', 'false'));
    afterEach(() => vi.unstubAllEnvs());
    const projectUuid = '11111111-1111-4111-8111-111111111111';
    const methods = [
        'compileProject',
        'validateProject',
        'replaceCustomFields',
        'materializePreAggregate',
    ] as const;
    const setup = (method: (typeof methods)[number]) => {
        const user = {
            ...projectUser,
            userUuid: 'user-1',
            organizationUuid: 'org-1',
        };
        const account = fromSession(user);
        const execution = {
            grantUuid: 'grant-1',
            revision: 1,
            subjectUserUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            clientId: 'lightdash-cli',
            resource: 'https://example.com/api',
            refreshFamilyUuid: 'family-1',
            scopes: ['read', 'write'],
            operation: {
                kind: 'rest' as const,
                key: 'ProjectController.refresh',
            },
        };
        const scope = createAgentExecutionContext({
            account,
            surface: AgentActorSurface.CLI,
            clientId: execution.clientId,
            agentUuid: null,
            agentIdentityEnabled: true,
            agentConnectionGrant: {
                grantUuid: execution.grantUuid,
                revision: execution.revision,
            },
            agentConnectionExecution: execution,
        });
        const assertActiveExecution = vi
            .fn()
            .mockResolvedValue({ account, scope });
        const scopes: unknown[] = [];
        const effect = vi.fn(async () => {
            scopes.push(agentExecutionContext.getStore());
            if (method === 'materializePreAggregate')
                return {
                    materializationUuid: 'materialization',
                    status: 'active',
                };
            if (method === 'validateProject') return [];
            return undefined;
        });
        const getSession = vi.fn().mockResolvedValue(user);
        const getAccount = vi.fn().mockResolvedValue(account);
        const children = {
            generateValidation: vi.fn(),
            replaceCustomFields: vi.fn(),
        };
        const storeValidation = vi.fn();
        const findFields = vi.fn().mockResolvedValue({});
        const task = new TestSchedulerTask({
            ...({} as TaskDeps),
            getAgentConnectionGrantService: () => ({ assertActiveExecution }),
            analytics: { track: vi.fn() },
            userService: {
                getSessionByUserUuid: getSession,
                getAccountByUserUuid: getAccount,
            },
            projectService: {
                assertAgentConnectionEffect: vi.fn(),
                assertConnectionPreAggregateRefresh: vi.fn(),
                compileProject: effect,
                replaceCustomFields: effect,
                findReplaceableCustomFields: findFields,
                _markJobAsFailed: vi.fn(),
            },
            schedulerService: { logSchedulerJob: vi.fn() },
            schedulerClient: children,
            validationService: { generateValidation: effect, storeValidation },
            catalogService: {
                indexCatalog: effect,
                migrateCatalogItemTags: vi.fn(),
                migrateCatalogItemIcons: vi.fn(),
                migrateMetricsTreeEdges: vi.fn(),
                migrateMetricsTreeNodes: vi.fn(),
                setChartUsages: vi.fn(),
            },
            preAggregateMaterializationService: {
                materializePreAggregate: effect,
            },
        } as unknown as TaskDeps);
        const payload = {
            userUuid: user.userUuid,
            createdByUserUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
            jobUuid: 'compile-1',
            requestMethod: RequestMethod.CLI,
            isPreview: false,
            syncContentAfterCompile: true,
            validationTargets: [],
            context: 'dbt_refresh',
            preAggregateDefinitionUuid: 'definition',
            trigger: 'compile',
            agentConnectionExecution: execution,
            agentConnectionEffect: method,
        };
        const run = (data: unknown = payload) =>
            (
                task as unknown as Record<
                    (typeof methods)[number],
                    (job: string, time: Date, data: unknown) => Promise<void>
                >
            )[method]('job-1', new Date(), data);
        return {
            run,
            task,
            payload,
            account,
            execution,
            scope,
            scopes,
            effect,
            getSession,
            getAccount,
            children,
            assertActiveExecution,
            storeValidation,
            findFields,
        };
    };
    const setupRealMaterialization = () => {
        const f = setup('materializePreAggregate');
        const model = {
            getPreAggregateDefinitionByUuid: vi.fn().mockResolvedValue({
                preAggregateDefinitionUuid: 'definition',
                preAggregateDefinition: {
                    name: 'orders_summary',
                    dimensions: ['orders_status'],
                    metrics: [],
                },
                materializationMetricQuery: {
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: ['orders_status'],
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
            }),
            insertInProgress: vi
                .fn()
                .mockResolvedValue({ materializationUuid: 'mat-1' }),
            markFailed: vi.fn(),
            attachQueryUuid: vi.fn(),
            promoteToActive: vi.fn().mockResolvedValue({ status: 'active' }),
        };
        const query = vi.fn().mockResolvedValue({ queryUuid: 'query-1' });
        const poll = vi.fn().mockResolvedValue({
            status: QueryHistoryStatus.READY,
            resultsFileName: 'query-1-results',
            resultsUpdatedAt: new Date(),
            totalRowCount: 2,
            columns: null,
        });
        const materialization = new PreAggregateMaterializationService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            preAggregateModel: model,
            projectModel: {},
            asyncQueryService: { executeAsyncMetricQuery: query },
            queryHistoryModel: { pollForQueryCompletion: poll },
            preAggregateResultsStorageClient: {
                getFileSize: vi.fn().mockResolvedValue(10),
                uploadResults: vi.fn(),
            },
        } as never);
        Object.assign(f.task, {
            preAggregateMaterializationService: materialization,
        });
        return { ...f, model, query, poll };
    };
    test.each(
        [4, 5, 6, 7].flatMap((failureAt) =>
            ['refusal', 'plain'].map((kind) => ({ failureAt, kind })),
        ),
    )(
        'real materialization propagates late check $failureAt: $kind',
        async ({ failureAt, kind }) => {
            const f = setupRealMaterialization();
            const error =
                kind === 'refusal'
                    ? new ForbiddenError('late refusal')
                    : new Error('late database failure');
            let calls = 0;
            f.assertActiveExecution.mockImplementation(async () => {
                calls += 1;
                if (calls === failureAt) throw error;
                return { account: f.account, scope: f.scope };
            });
            const payload = structuredClone(f.payload);
            if (kind === 'refusal')
                await expect(f.run(payload)).resolves.toBeUndefined();
            else await expect(f.run(payload)).rejects.toBe(error);
            expect(f.model.markFailed).toHaveBeenCalledWith({
                materializationUuid: 'mat-1',
                errorMessage: error.message,
            });
            expect(f.model.promoteToActive).not.toHaveBeenCalled();
            expect(
                f.task['schedulerService'].logSchedulerJob,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
            );
            expect(
                f.task['schedulerService'].logSchedulerJob,
            ).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    status: SchedulerJobStatus.COMPLETED,
                }),
            );
            if (kind === 'plain') {
                const beforeRetry = calls;
                await expect(f.run(payload)).resolves.toBeUndefined();
                expect(calls).toBeGreaterThan(beforeRetry);
                expect(f.model.insertInProgress).toHaveBeenCalledTimes(2);
                expect(f.model.promoteToActive).toHaveBeenCalledOnce();
                for (const [execution] of f.assertActiveExecution.mock.calls)
                    expect(execution).toEqual(f.execution);
            }
            expect(f.getAccount).not.toHaveBeenCalled();
            expect(f.getSession).not.toHaveBeenCalled();
        },
    );
    test.each(
        [true, false].flatMap((bound) =>
            ['reported', 'thrown'].map((failure) => ({ bound, failure })),
        ),
    )(
        'real materialization keeps query failures as failed outcomes: bound=$bound failure=$failure',
        async ({ bound, failure }) => {
            const f = setupRealMaterialization();
            if (failure === 'reported')
                f.poll.mockResolvedValue({
                    status: QueryHistoryStatus.ERROR,
                    error: 'warehouse failure',
                });
            else f.query.mockRejectedValue(new Error('warehouse failure'));
            const {
                agentConnectionExecution,
                agentConnectionEffect,
                ...unbound
            } = f.payload;
            await expect(
                f.run(bound ? f.payload : unbound),
            ).resolves.toBeUndefined();
            expect(f.model.markFailed).toHaveBeenCalledWith({
                materializationUuid: 'mat-1',
                errorMessage: 'warehouse failure',
            });
            expect(
                f.task['schedulerService'].logSchedulerJob,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: SchedulerJobStatus.COMPLETED,
                    details: expect.objectContaining({
                        materializationStatus: 'failed',
                    }),
                }),
            );
            expect(
                f.task['schedulerService'].logSchedulerJob,
            ).not.toHaveBeenCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
            );
            if (!bound) expect(f.assertActiveExecution).not.toHaveBeenCalled();
        },
    );

    test.each([
        ['replaceCustomFields', AgentCapability.ContentWrite],
        ['materializePreAggregate', AgentCapability.Query],
        ['validateProject', AgentCapability.DeployUpload],
    ] as const)(
        '%s uses the real current policy before the child effect',
        async (method, capability) => {
            const f = setup(method);
            const authority = managedExecutionFixture();
            Object.assign(f.task, {
                getAgentConnectionGrantService: () => authority.service,
            });
            const payload = {
                ...f.payload,
                userUuid: authority.user.userUuid,
                createdByUserUuid: authority.user.userUuid,
                organizationUuid: authority.grant.organizationUuid,
                projectUuid: authority.projectUuid,
                agentConnectionExecution: authority.execution,
            };
            await f.run(structuredClone(payload));
            expect(f.effect).toHaveBeenCalledOnce();
            f.effect.mockClear();
            authority.policy.systemRoleMatrix.viewer = Object.values(
                AgentCapability,
            ).filter((value) => value !== capability);
            await f.run(structuredClone(payload));
            expect(f.effect).not.toHaveBeenCalled();
            expect(f.getSession).not.toHaveBeenCalled();
            expect(f.getAccount).not.toHaveBeenCalled();
        },
    );

    test('ordinary compile launches both child jobs before their promises settle', async () => {
        const f = setup('compileProject');
        const order: string[] = [];
        f.children.generateValidation.mockImplementation(() => {
            order.push('validation');
            return Promise.resolve().then(() => {
                order.push('validation settled');
            });
        });
        f.children.replaceCustomFields.mockImplementation(() => {
            order.push('replacement');
        });
        const {
            agentConnectionExecution: ignoredExecution,
            agentConnectionEffect: ignoredEffect,
            ...payload
        } = f.payload;
        await f.run(payload);
        expect(order).toEqual([
            'validation',
            'replacement',
            'validation settled',
        ]);
    });

    test.each(methods)(
        '%s terminalises non-refusal setup errors',
        async (method) => {
            const f = setup(method);
            f.assertActiveExecution.mockRejectedValueOnce(
                new Error('subject deleted'),
            );
            await expect(f.run()).resolves.toBeUndefined();
            expect(f.effect).not.toHaveBeenCalled();
            expect(f.getSession).not.toHaveBeenCalled();
            expect(f.getAccount).not.toHaveBeenCalled();
            expect(
                f.task['schedulerService'].logSchedulerJob,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
            );
            if (method === 'compileProject')
                expect(
                    f.task['projectService']._markJobAsFailed,
                ).toHaveBeenCalledWith('compile-1');
        },
    );

    test.each(methods)(
        '%s retries every later plain revalidation failure with the same binding',
        async (method) => {
            const successful = setup(method);
            await successful.run();
            const validationCount =
                successful.assertActiveExecution.mock.calls.length;
            expect(validationCount).toBeGreaterThan(1);
            await Promise.all(
                Array.from(
                    { length: validationCount - 1 },
                    async (_, index) => {
                        const failureAt = index + 2;
                        const f = setup(method);
                        const error = new Error(
                            `revalidation ${failureAt} unavailable`,
                        );
                        let calls = 0;
                        f.assertActiveExecution.mockImplementation(async () => {
                            calls += 1;
                            if (calls === failureAt) throw error;
                            return { account: f.account, scope: f.scope };
                        });
                        const payload = structuredClone(f.payload);
                        await expect(f.run(payload)).rejects.toBe(error);
                        const callsBeforeRetry = calls;
                        await expect(f.run(payload)).resolves.toBeUndefined();
                        expect(calls).toBeGreaterThan(callsBeforeRetry);
                        expect(payload.agentConnectionExecution).toEqual(
                            f.execution,
                        );
                        expect(f.getSession).not.toHaveBeenCalled();
                        expect(f.getAccount).not.toHaveBeenCalled();
                        for (const [execution] of f.assertActiveExecution.mock
                            .calls as unknown[][])
                            expect(execution).toEqual(f.execution);
                    },
                ),
            );
        },
    );

    test.each(methods)(
        '%s restores a serialized connection and never reconstructs a session',
        async (method) => {
            const f = setup(method);
            await f.run(structuredClone(f.payload));
            expect(f.effect).toHaveBeenCalledOnce();
            expect(f.scopes[0]).toEqual(f.scope);
            expect(f.getSession).not.toHaveBeenCalled();
            expect(f.getAccount).not.toHaveBeenCalled();
            expect(f.assertActiveExecution).toHaveBeenCalledWith(
                f.execution,
                expect.objectContaining({
                    projectUuid,
                    recheckOperation: true,
                }),
            );
            if (method === 'compileProject') {
                expect(f.effect.mock.calls[0]).toEqual([
                    expect.objectContaining({
                        ability: f.account.user.ability,
                    }),
                    projectUuid,
                    RequestMethod.CLI,
                    'compile-1',
                    undefined,
                ]);
                expect(f.children.generateValidation).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentConnectionExecution: f.execution,
                        agentConnectionEffect: 'validateProject',
                    }),
                );
                expect(f.children.replaceCustomFields).toHaveBeenCalledWith(
                    expect.objectContaining({
                        agentConnectionExecution: f.execution,
                        agentConnectionEffect: 'replaceCustomFields',
                    }),
                );
            }
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
    test.each(
        methods.flatMap((method) =>
            ['revoked', 'expired', 'revised', 'disabled'].map((reason) => ({
                method,
                reason,
            })),
        ),
    )(
        '$method stops $reason work without retrying as a session',
        async ({ method, reason }) => {
            const f = setup(method);
            f.assertActiveExecution.mockRejectedValue(
                new ForbiddenError(reason),
            );
            await expect(
                f.run(structuredClone(f.payload)),
            ).resolves.toBeUndefined();
            expect(f.effect).not.toHaveBeenCalled();
            expect(f.getSession).not.toHaveBeenCalled();
            expect(f.getAccount).not.toHaveBeenCalled();
            expect(f.children.generateValidation).not.toHaveBeenCalled();
            expect(f.children.replaceCustomFields).not.toHaveBeenCalled();
        },
    );
    test('rechecks after compile before enqueuing either child', async () => {
        const f = setup('compileProject');
        f.effect.mockImplementation(async () => {
            f.assertActiveExecution.mockRejectedValue(
                new ForbiddenError('revoked'),
            );
        });
        await f.run();
        expect(f.effect).toHaveBeenCalledOnce();
        expect(f.children.generateValidation).not.toHaveBeenCalled();
        expect(f.children.replaceCustomFields).not.toHaveBeenCalled();
    });
    test('rechecks after validation before storing its result', async () => {
        const f = setup('validateProject');
        f.effect.mockImplementation(async () => {
            f.assertActiveExecution.mockRejectedValue(
                new ForbiddenError('expired'),
            );
            return [];
        });
        await f.run();
        expect(f.storeValidation).not.toHaveBeenCalled();
    });
    test('refuses a compile job whose envelope came from a read operation', async () => {
        const f = setup('compileProject');
        await f.run({
            ...f.payload,
            agentConnectionExecution: {
                ...f.execution,
                operation: {
                    kind: 'rest',
                    key: 'SqlRunnerController.getTables',
                },
            },
        });
        expect(f.effect).not.toHaveBeenCalled();
        expect(f.getSession).not.toHaveBeenCalled();
    });
    test('refuses a typed connection effect with a missing envelope', async () => {
        const f = setup('compileProject');
        await f.run({ ...f.payload, agentConnectionExecution: null });
        expect(f.effect).not.toHaveBeenCalled();
        expect(f.getSession).not.toHaveBeenCalled();
    });

    test('refuses an effect substituted on a bound payload', async () => {
        const f = setup('compileProject');
        await f.run({ ...f.payload, agentConnectionEffect: 'validateProject' });
        expect(f.effect).not.toHaveBeenCalled();
        expect(f.getSession).not.toHaveBeenCalled();
    });
});
