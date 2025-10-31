import {
    ApiGetAsyncQueryResults,
    QueryHistoryStatus,
    type ResultRow,
} from '@lightdash/common';
import { pollAsyncQueryResults } from './pollAsyncQueryResults';

jest.useFakeTimers();

describe('pollAsyncQueryResults', () => {
    const mockQueryUuid = 'test-query-uuid';

    const mockResultRow: ResultRow = {
        id: { value: { raw: 1, formatted: '1' } },
        name: { value: { raw: 'Test', formatted: 'Test' } },
    };

    const createReadyResults = (
        rows: ResultRow[] = [mockResultRow],
    ): ApiGetAsyncQueryResults => ({
        status: QueryHistoryStatus.READY,
        queryUuid: mockQueryUuid,
        rows,
        columns: {},
        initialQueryExecutionMs: 100,
        resultsPageExecutionMs: 50,
        pageSize: 25,
        page: 1,
        totalPageCount: 1,
        totalResults: rows.length,
        nextPage: undefined,
        previousPage: undefined,
        pivotDetails: {
            totalColumnCount: null,
            indexColumn: undefined,
            valuesColumns: [],
            groupByColumns: undefined,
            sortBy: undefined,
            originalColumns: {},
        },
    });

    const createPendingResults = (): ApiGetAsyncQueryResults => ({
        status: QueryHistoryStatus.PENDING,
        queryUuid: mockQueryUuid,
    });

    const createErrorResults = (error?: string): ApiGetAsyncQueryResults => ({
        status: QueryHistoryStatus.ERROR,
        queryUuid: mockQueryUuid,
        error: error ?? null,
    });

    const createCancelledResults = (): ApiGetAsyncQueryResults => ({
        status: QueryHistoryStatus.CANCELLED,
        queryUuid: mockQueryUuid,
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('when query succeeds on first attempt', () => {
        it('should return results immediately for READY status', async () => {
            const mockResults = createReadyResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValue(mockResults);

            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
            );

            const results = await promise;

            expect(results).toEqual(mockResults);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(1);
            expect(getAsyncQueryResults).toHaveBeenCalledWith(mockQueryUuid);
        });
    });

    describe('when query requires polling', () => {
        it('should poll until READY with exponential backoff', async () => {
            const pendingResults = createPendingResults();
            const readyResults = createReadyResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValueOnce(pendingResults)
                .mockResolvedValueOnce(pendingResults)
                .mockResolvedValueOnce(readyResults);

            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
            );

            // First call happens immediately
            await jest.advanceTimersByTimeAsync(0);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(1);

            // Second call after 250ms backoff
            await jest.advanceTimersByTimeAsync(250);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(2);

            // Third call after 500ms backoff (doubled)
            await jest.advanceTimersByTimeAsync(500);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(3);

            const results = await promise;
            expect(results).toEqual(readyResults);
        });

        it('should cap backoff at 1000ms', async () => {
            const pendingResults = createPendingResults();
            const readyResults = createReadyResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValueOnce(pendingResults) // 250ms
                .mockResolvedValueOnce(pendingResults) // 500ms
                .mockResolvedValueOnce(pendingResults) // 1000ms (capped)
                .mockResolvedValueOnce(pendingResults) // 1000ms (capped)
                .mockResolvedValueOnce(readyResults);

            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
            );

            // Progress through backoffs
            await jest.advanceTimersByTimeAsync(0);
            await jest.advanceTimersByTimeAsync(250);
            await jest.advanceTimersByTimeAsync(500);
            await jest.advanceTimersByTimeAsync(1000);
            await jest.advanceTimersByTimeAsync(1000);

            const results = await promise;
            expect(results).toEqual(readyResults);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(5);
        });
    });

    describe('when query fails', () => {
        it('should throw error for ERROR status with error message', async () => {
            const errorResults = createErrorResults('SQL syntax error');

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValue(errorResults);

            await expect(
                pollAsyncQueryResults(getAsyncQueryResults, mockQueryUuid),
            ).rejects.toThrow('SQL syntax error');
        });

        it('should throw generic error for ERROR status without error message', async () => {
            const errorResults = createErrorResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValue(errorResults);

            await expect(
                pollAsyncQueryResults(getAsyncQueryResults, mockQueryUuid),
            ).rejects.toThrow('Unknown error executing query.');
        });

        it('should throw error for CANCELLED status', async () => {
            const cancelledResults = createCancelledResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValue(cancelledResults);

            await expect(
                pollAsyncQueryResults(getAsyncQueryResults, mockQueryUuid),
            ).rejects.toThrow('Query was cancelled.');
        });

        it('should throw timeout error after max attempts', async () => {
            const pendingResults = createPendingResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValue(pendingResults);

            // Start polling
            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
            );

            // Advance through enough polling cycles to hit max attempts
            // Each cycle: check, wait backoff, recurse
            // Backoff pattern: 250ms, 500ms, 1000ms, 1000ms...
            // We need to go through 120 attempts
            let totalTime = 0;
            for (let i = 0; i < 120; i += 1) {
                let backoff = 1000;
                if (i === 0) {
                    backoff = 250;
                } else if (i === 1) {
                    backoff = 500;
                }
                totalTime += backoff;
            }

            // Advance by total time plus a bit more
            const advancePromise = jest.advanceTimersByTimeAsync(totalTime);

            // Now expect the promise to reject
            await expect(promise).rejects.toThrow(
                'Query timed out waiting for results.',
            );

            await advancePromise;

            // Verify it hit the max attempts
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(120);
        });
    });

    describe('with custom backoff', () => {
        it('should use provided initial backoff value', async () => {
            const pendingResults = createPendingResults();
            const readyResults = createReadyResults();

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValueOnce(pendingResults)
                .mockResolvedValueOnce(readyResults);

            const customBackoff = 500;
            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
                customBackoff,
            );

            // First call
            await jest.advanceTimersByTimeAsync(0);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(1);

            // Second call after custom backoff
            await jest.advanceTimersByTimeAsync(customBackoff);
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(2);

            const results = await promise;
            expect(results).toEqual(readyResults);
        });
    });

    describe('edge cases', () => {
        it('should handle network errors from getAsyncQueryResults', async () => {
            const networkError = new Error('Network request failed');
            const getAsyncQueryResults = jest
                .fn()
                .mockRejectedValue(networkError);

            await expect(
                pollAsyncQueryResults(getAsyncQueryResults, mockQueryUuid),
            ).rejects.toThrow('Network request failed');
        });

        it('should call getAsyncQueryResults with correct uuid on each poll', async () => {
            const pendingResults = createPendingResults();
            const readyResults = createReadyResults([]);

            const getAsyncQueryResults = jest
                .fn()
                .mockResolvedValueOnce(pendingResults)
                .mockResolvedValueOnce(pendingResults)
                .mockResolvedValueOnce(readyResults);

            const promise = pollAsyncQueryResults(
                getAsyncQueryResults,
                mockQueryUuid,
            );

            await jest.advanceTimersByTimeAsync(0);
            await jest.advanceTimersByTimeAsync(250);
            await jest.advanceTimersByTimeAsync(500);

            await promise;

            // Verify all calls used the same uuid
            expect(getAsyncQueryResults).toHaveBeenCalledTimes(3);
            getAsyncQueryResults.mock.calls.forEach((call) => {
                expect(call[0]).toBe(mockQueryUuid);
            });
        });
    });
});
