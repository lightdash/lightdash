import {
    DimensionType,
    DownloadFileType,
    FieldReferenceError,
    FieldType,
    ForbiddenError,
    GoogleSheetsQuotaError,
    GoogleSheetsTransientError,
    LightdashPage,
    MetricType,
    NotEnoughResults,
    PartialFailureType,
    SchedulerFormat,
    ThresholdOperator,
    type CapturedQuery,
    type CreateSchedulerAndTargets,
    type DeliveryCaptureManifest,
    type NotificationPayloadBase,
    type ScheduledDeliveryPayload,
    type UploadGsheetPayload,
} from '@lightdash/common';
import ExecutionContext from 'node-execution-context';
import type { ExecutionContextInfo } from '../logging/winston';
import SchedulerTask, {
    buildItemMapFromColumns,
    buildSchedulerLogContext,
    dedupeArtifactFilename,
    GSHEET_UPLOAD_MAX_ATTEMPTS,
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

describe('uploadGsheetFromQuery — rows branch', () => {
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
});

type TaskDeps = ConstructorParameters<typeof SchedulerTask>[0];

const makeTaskWithDeps = (overrides: Partial<TaskDeps> = {}) =>
    new SchedulerTask({ ...({} as TaskDeps), ...overrides });

const asDep = <K extends keyof TaskDeps>(value: unknown): TaskDeps[K] =>
    value as TaskDeps[K];

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
    }: {
        download?: (args: { queryUuid: string }) => Promise<{
            fileUrl: string;
            s3FileUrl?: string;
        }>;
        fileStorageEnabled?: boolean;
    } = {}) => {
        const downloadSyncQueryResults = vi.fn(
            download ??
                (async ({ queryUuid }: { queryUuid: string }) => ({
                    fileUrl: `https://files.example.com/${queryUuid}`,
                    s3FileUrl: `s3://bucket/${queryUuid}`,
                })),
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
            }),
            slackClient: asDep<'slackClient'>({ isEnabled: false }),
        });
        return { task, downloadSyncQueryResults, findAppByUuid, trackAccount };
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
    const setup = () => {
        const captureAppDeliveryManifest = vi
            .fn()
            .mockResolvedValue(manifestOf([readyItem()]));
        const generateJobsForSchedulerTargets = vi.fn().mockResolvedValue([]);
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
            analytics: asDep<'analytics'>({ track: vi.fn() }),
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
        });
        (task as unknown as Record<string, unknown>).getNotificationPageData =
            getNotificationPageData;
        return {
            task,
            captureAppDeliveryManifest,
            getNotificationPageData,
            generateJobsForSchedulerTargets,
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
        expect(blocks).toContain('csv-Revenue-2026-07-30.csv');
        expect(blocks).toContain(
            'Sessions reached its query limit; additional rows may exist (5000 rows delivered)',
        );
        expect(blocks).toContain('Orders');
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
});
