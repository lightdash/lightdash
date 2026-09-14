import HiveDriverError from '@databricks/sql/dist/errors/HiveDriverError';
import OperationStateError, {
    OperationStateErrorCode,
} from '@databricks/sql/dist/errors/OperationStateError';
import StatusError from '@databricks/sql/dist/errors/StatusError';
import { TStatusCode } from '@databricks/sql/thrift/TCLIService_types';
import {
    DATABRICKS_WAREHOUSE_STARTUP_RETRY,
    DatabricksWarehouseStartupRetry,
    getDatabricksWarehouseStartupRetryDelayMs,
    isDatabricksWarehouseStartingError,
} from './DatabricksWarehouseStartupRetry';

const statusError = (errorMessage: string) =>
    new StatusError({ statusCode: TStatusCode.ERROR_STATUS, errorMessage });

const sessionHandleError = statusError(
    'requirement failed: Session handle: SessionHandle [01f19fd1-ac81-1e09-bb7c-357018ed26f1] has not been initialized or had already closed.',
);
const diskDirectoryError = statusError(
    "Couldn't create directory /local_disk0/tmp/a1b2c3d4-0000-1111-2222-333344445555/_resources",
);
const warehouseStartingError = statusError(
    'SQL warehouse xyz is not ready to accept connections (current state: STARTING)',
);
// Pro/classic warehouse in STARTING: 503s until the driver's own HTTP retries give up
const driverRetriesExhaustedError = new HiveDriverError(
    'Hive driver: 503 when connecting to resource. Max retry count exceeded.',
);

describe('isDatabricksWarehouseStartingError', () => {
    it('matches the errors Databricks returns while a SQL warehouse is stopped or starting', () => {
        expect(isDatabricksWarehouseStartingError(sessionHandleError)).toBe(
            true,
        );
        expect(isDatabricksWarehouseStartingError(diskDirectoryError)).toBe(
            true,
        );
        expect(isDatabricksWarehouseStartingError(warehouseStartingError)).toBe(
            true,
        );
        expect(
            isDatabricksWarehouseStartingError(driverRetriesExhaustedError),
        ).toBe(true);
    });

    it('does not match other HTTP failures the driver gave up on', () => {
        expect(
            isDatabricksWarehouseStartingError(
                new HiveDriverError(
                    'Hive driver: 500 when connecting to resource. Max retry count exceeded.',
                ),
            ),
        ).toBe(false);
    });

    it('matches the same messages when the operation fails during polling', () => {
        const error = new OperationStateError(OperationStateErrorCode.Error, {
            displayMessage: diskDirectoryError.message,
        } as ConstructorParameters<typeof OperationStateError>[1]);

        expect(isDatabricksWarehouseStartingError(error)).toBe(true);
        expect(
            isDatabricksWarehouseStartingError(
                new OperationStateError(OperationStateErrorCode.Timeout),
            ),
        ).toBe(false);
    });

    it('does not match SQL, permission or auth failures', () => {
        expect(
            isDatabricksWarehouseStartingError(
                statusError(
                    '[PARSE_SYNTAX_ERROR] Syntax error at or near FROM',
                ),
            ),
        ).toBe(false);
        expect(
            isDatabricksWarehouseStartingError(
                statusError(
                    'PERMISSION_DENIED: User does not have USE SCHEMA on Schema',
                ),
            ),
        ).toBe(false);
        expect(
            isDatabricksWarehouseStartingError(
                new Error('Request failed with status 401: Unauthorized'),
            ),
        ).toBe(false);
    });

    it('only matches driver status errors, not other errors with the same text', () => {
        expect(
            isDatabricksWarehouseStartingError(
                new Error(sessionHandleError.message),
            ),
        ).toBe(false);
    });
});

describe('getDatabricksWarehouseStartupRetryDelayMs', () => {
    it('backs off exponentially from 2s, capped at 30s', () => {
        const delays = [1, 2, 3, 4, 5, 6].map((attempt) =>
            getDatabricksWarehouseStartupRetryDelayMs(attempt, 0),
        );

        expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    });

    it('stops once the next wait would pass the deadline', () => {
        const { deadlineMs } = DATABRICKS_WAREHOUSE_STARTUP_RETRY;

        expect(
            getDatabricksWarehouseStartupRetryDelayMs(9, deadlineMs - 30_000),
        ).toBe(30_000);
        expect(
            getDatabricksWarehouseStartupRetryDelayMs(9, deadlineMs - 29_999),
        ).toBeNull();
    });
});

describe('DatabricksWarehouseStartupRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Drains the backoff timer so the wait resolves under fake timers
    const waitBeforeRetry = async (
        retry: DatabricksWarehouseStartupRetry,
        error: unknown,
    ) => {
        const result = retry.waitBeforeRetry(error);
        await vi.runAllTimersAsync();
        return result;
    };

    it('waits with backoff before retrying a warehouse startup error', async () => {
        const retry = new DatabricksWarehouseStartupRetry();

        const start = Date.now();
        await expect(waitBeforeRetry(retry, sessionHandleError)).resolves.toBe(
            true,
        );
        expect(Date.now() - start).toBe(2_000);
        await expect(waitBeforeRetry(retry, diskDirectoryError)).resolves.toBe(
            true,
        );
        expect(Date.now() - start).toBe(6_000);

        expect(console.warn).toHaveBeenCalledTimes(2);
        expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
            'has not been initialized',
        );
    });

    it('does not wait for errors that are not warehouse startup errors', async () => {
        const retry = new DatabricksWarehouseStartupRetry();

        await expect(
            retry.waitBeforeRetry(statusError('Syntax error near FROM')),
        ).resolves.toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('counts time spent outside the wait against the deadline', async () => {
        const retry = new DatabricksWarehouseStartupRetry();
        const start = Date.now();

        let retries = 0;
        // eslint-disable-next-line no-await-in-loop
        while (await waitBeforeRetry(retry, sessionHandleError)) {
            retries += 1;
            vi.advanceTimersByTime(31_000); // the driver's own HTTP retries per attempt
        }

        expect(retries).toBe(11);
        expect(Date.now() - start).toBeLessThanOrEqual(
            DATABRICKS_WAREHOUSE_STARTUP_RETRY.deadlineMs + 31_000,
        );
    });
});
