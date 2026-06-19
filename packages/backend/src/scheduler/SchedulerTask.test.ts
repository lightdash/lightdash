import {
    DimensionType,
    FieldReferenceError,
    FieldType,
    ForbiddenError,
    GoogleSheetsQuotaError,
    GoogleSheetsTransientError,
    MetricType,
    NotEnoughResults,
    SchedulerJobStatus,
    ThresholdOperator,
    type CompileProjectPayload,
    type UploadGsheetPayload,
} from '@lightdash/common';
import ExecutionContext from 'node-execution-context';
import type { ExecutionContextInfo } from '../logging/winston';
import SchedulerTask, {
    buildItemMapFromColumns,
    buildSchedulerLogContext,
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

jest.mock('@lightdash/common', () => ({
    ...jest.requireActual('@lightdash/common'),
    // Skip real backoff delays so the retry loop runs instantly.
    sleep: jest.fn().mockResolvedValue(undefined),
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
        const update = jest.fn();
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
        const write = jest.fn().mockResolvedValue(undefined);

        await retryTransientGoogleSheetsWrite(write);

        expect(write).toHaveBeenCalledTimes(1);
    });

    it('retries a transient Google error and succeeds without re-running the query', async () => {
        const write = jest
            .fn()
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockResolvedValueOnce(undefined);

        await retryTransientGoogleSheetsWrite(write);

        // The query is not part of `write` — only the upload step retries.
        expect(write).toHaveBeenCalledTimes(2);
    });

    it('gives up after the max attempts when the transient error persists', async () => {
        const write = jest.fn().mockRejectedValue(new GoogleSheetsQuotaError());

        await expect(retryTransientGoogleSheetsWrite(write)).rejects.toThrow(
            GoogleSheetsQuotaError,
        );
        expect(write).toHaveBeenCalledTimes(GSHEET_UPLOAD_MAX_ATTEMPTS);
    });

    it('does not retry a non-transient error', async () => {
        const write = jest
            .fn()
            .mockRejectedValue(new ForbiddenError('no access'));

        await expect(retryTransientGoogleSheetsWrite(write)).rejects.toThrow(
            ForbiddenError,
        );
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('reports each upcoming retry attempt via onRetry', async () => {
        const write = jest
            .fn()
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockRejectedValueOnce(new GoogleSheetsTransientError())
            .mockResolvedValueOnce(undefined);
        const onRetry = jest.fn().mockResolvedValue(undefined);

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
        const mockCreateNewSheet = jest.fn().mockResolvedValue({
            spreadsheetId: 'sheet-123',
            spreadsheetUrl: 'https://sheets.example.com/sheet-123',
        });
        const mockAppendToSheet = jest.fn().mockResolvedValue(undefined);
        const mockGetRefreshToken = jest
            .fn()
            .mockResolvedValue('refresh-token');
        const mockGetAccountByUserUuid = jest.fn().mockResolvedValue({
            user: { id: 'user-1' },
        });
        const mockLogSchedulerJob = jest.fn().mockResolvedValue(undefined);
        const mockTrackAccount = jest.fn();
        const mockTrack = jest.fn();
        const mockExecuteMetricQueryAndGetResults = jest.fn();

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
                updateGsheetExportProgress: jest
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

describe('compileProject', () => {
    const makeTask = (
        overrides: Partial<ConstructorParameters<typeof SchedulerTask>[0]> = {},
    ) => {
        const stub = {} as ConstructorParameters<typeof SchedulerTask>[0];
        return new SchedulerTask({
            ...stub,
            ...overrides,
        });
    };

    it('marks the legacy job as failed when project compile is forbidden', async () => {
        const error = new ForbiddenError();
        const mockGetSessionByUserUuid = jest.fn().mockResolvedValue({
            userUuid: 'user-1',
        });
        const mockLogSchedulerJob = jest.fn().mockResolvedValue(undefined);
        const mockCompileProject = jest.fn().mockRejectedValue(error);
        const mockMarkJobAsFailed = jest.fn().mockResolvedValue(undefined);

        const task = makeTask({
            userService: {
                getSessionByUserUuid: mockGetSessionByUserUuid,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['userService'],
            schedulerService: {
                logSchedulerJob: mockLogSchedulerJob,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['schedulerService'],
            projectService: {
                compileProject: mockCompileProject,
                _markJobAsFailed: mockMarkJobAsFailed,
            } as unknown as ConstructorParameters<
                typeof SchedulerTask
            >[0]['projectService'],
        });

        const payload: CompileProjectPayload = {
            createdByUserUuid: 'user-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            requestMethod: 'api',
            jobUuid: 'job-1',
            isPreview: true,
            validateAfterCompile: false,
            userUuid: 'user-1',
        };

        await expect(
            (
                task as unknown as {
                    compileProject(
                        jobId: string,
                        scheduledTime: Date,
                        payload: CompileProjectPayload,
                    ): Promise<void>;
                }
            ).compileProject('graphile-job-1', new Date(), payload),
        ).rejects.toBe(error);

        expect(mockLogSchedulerJob).toHaveBeenCalledWith(
            expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
        );
        expect(mockMarkJobAsFailed).toHaveBeenCalledWith('job-1');
    });
});
