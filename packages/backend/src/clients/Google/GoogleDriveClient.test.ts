import {
    AnyType,
    DimensionType,
    FieldType,
    GoogleSheetsQuotaError,
    GoogleSheetsSupersededError,
    GoogleSheetsTransientError,
    TimeFrames,
    UnexpectedGoogleSheetsError,
    type Dimension,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { google } from 'googleapis';
import {
    GoogleDriveClient,
    planGoogleSheetsWriteChunks,
} from './GoogleDriveClient';
import {
    googleApiError,
    googleInternalError,
    googleOAuthError,
    googleQuotaError,
    GoogleSheetsFake,
} from './GoogleSheetsFake.mock';

vi.mock('googleapis', () => ({
    google: {
        auth: {
            fromJSON: vi.fn(),
            GoogleAuth: vi.fn(),
        },
        sheets: vi.fn(),
    },
}));

describe('GoogleDriveClient', () => {
    describe('formatRow', () => {
        test('should defuse spreadsheet formula injection', () => {
            // Leading =, @, tab, and CR are unambiguous formula-injection
            // vectors when a viewer edits and re-enters the cell. Prefix with
            // a single quote to keep the cell literal.
            expect(GoogleDriveClient.formatCell('=HYPERLINK("evil")')).toEqual(
                `'=HYPERLINK("evil")`,
            );
            expect(GoogleDriveClient.formatCell('@SUM(A1:A10)')).toEqual(
                "'@SUM(A1:A10)",
            );
            expect(GoogleDriveClient.formatCell('\t=A1')).toEqual("'\t=A1");
            expect(GoogleDriveClient.formatCell('\r=A1')).toEqual("'\r=A1");
            // Leading - / + are NOT sanitised — negative numeric strings like
            // "-100" are extremely common and would otherwise be mangled.
            expect(GoogleDriveClient.formatCell('-100')).toEqual('-100');
            expect(GoogleDriveClient.formatCell('+0.5')).toEqual('+0.5');
            // Embedded = / @ are safe; only leading characters matter.
            expect(GoogleDriveClient.formatCell('a=b')).toEqual('a=b');
        });

        test('should format values', async () => {
            expect(GoogleDriveClient.formatCell(1)).toEqual(1);
            expect(GoogleDriveClient.formatCell(1.99)).toEqual(1.99);
            expect(GoogleDriveClient.formatCell('value')).toEqual('value');
            expect(GoogleDriveClient.formatCell(true)).toEqual(true);

            expect(GoogleDriveClient.formatCell(Number(123))).toEqual(123);
            expect(GoogleDriveClient.formatCell(String(123))).toEqual('123');
            expect(GoogleDriveClient.formatCell(Boolean(true))).toEqual(true);
            expect(GoogleDriveClient.formatCell(new Set([1, 2, 3]))).toEqual(
                `1,2,3`,
            );

            expect(GoogleDriveClient.formatCell(null)).toEqual(null);
            expect(GoogleDriveClient.formatCell(/a-z/)).toEqual(`a-z`); // RegExp
            expect(GoogleDriveClient.formatCell([1, 2, 3])).toEqual(`1,2,3`);
            expect(GoogleDriveClient.formatCell({ foo: 'bar' })).toEqual(
                `{"foo":"bar"}`,
            );
            expect(typeof GoogleDriveClient.formatCell(new Date())).toEqual(
                `object`,
            );
        });

        test('should format BigInt values safely', () => {
            // Small BigInt values within safe integer range should become numbers
            expect(GoogleDriveClient.formatCell(BigInt(55))).toEqual(55);
            expect(GoogleDriveClient.formatCell(BigInt(0))).toEqual(0);
            expect(GoogleDriveClient.formatCell(BigInt(-123))).toEqual(-123);
            expect(
                GoogleDriveClient.formatCell(BigInt(9007199254740991)),
            ).toEqual(9007199254740991); // MAX_SAFE_INTEGER

            // Very large BigInt values should become strings to preserve precision
            expect(
                GoogleDriveClient.formatCell(BigInt('9223372036854775807')),
            ).toEqual('9223372036854775807'); // Beyond safe integer range
            expect(
                GoogleDriveClient.formatCell(BigInt('-9223372036854775808')),
            ).toEqual('-9223372036854775808'); // Beyond safe integer range
            expect(
                GoogleDriveClient.formatCell(BigInt('9007199254740992')),
            ).toEqual('9007199254740992'); // MAX_SAFE_INTEGER + 1

            // Ensure the returned numbers are actual numbers (not strings)
            expect(typeof GoogleDriveClient.formatCell(BigInt(55))).toEqual(
                'number',
            );
            expect(
                typeof GoogleDriveClient.formatCell(
                    BigInt('9223372036854775807'),
                ),
            ).toEqual('string');
        });

        test('should truncate string values that exceed Google Sheets character limit', () => {
            // String shorter than limit should not be truncated
            const shortString = 'a'.repeat(1000);
            expect(GoogleDriveClient.formatCell(shortString)).toEqual(
                shortString,
            );

            // String exactly at limit should not be truncated
            const atLimitString = 'a'.repeat(50000);
            expect(GoogleDriveClient.formatCell(atLimitString)).toEqual(
                atLimitString,
            );

            // String exceeding limit should be truncated with suffix
            const longString = 'a'.repeat(50001);
            const truncated = GoogleDriveClient.formatCell(longString);
            expect(truncated).toHaveLength(50000);
            expect(truncated).toMatch(/\.\.\. \[TRUNCATED\]$/);

            // Very long array joined should be truncated
            const longArray = Array(60000).fill('x');
            const truncatedArray = GoogleDriveClient.formatCell(longArray);
            expect(truncatedArray).toHaveLength(50000);
            expect(truncatedArray).toMatch(/\.\.\. \[TRUNCATED\]$/);

            // Large JSON object should be truncated
            const largeObject = { data: 'x'.repeat(60000) };
            const truncatedObject = GoogleDriveClient.formatCell(largeObject);
            expect(truncatedObject).toHaveLength(50000);
            expect(truncatedObject).toMatch(/\.\.\. \[TRUNCATED\]$/);
        });
    });

    describe('appendToSheet', () => {
        test('should only export selected fields from the results table', async () => {
            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

            const appendCsvToSheet = vi
                .spyOn(client, 'appendCsvToSheet')
                .mockResolvedValue(undefined);

            await client.appendToSheet(
                'refresh-token',
                'file-id',
                [
                    {
                        orders_total_revenue: 120,
                        orders_normalized_charges: 150,
                    },
                ],
                {
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
                false,
            );

            expect(appendCsvToSheet).toHaveBeenCalledWith(
                'refresh-token',
                'file-id',
                [['Total revenue'], [120]],
                undefined,
                [],
            );
        });

        test('should write fixed header rows before the table header', async () => {
            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

            const appendCsvToSheet = vi
                .spyOn(client, 'appendCsvToSheet')
                .mockResolvedValue(undefined);

            await client.appendToSheet(
                'refresh-token',
                'file-id',
                [{ orders_total_revenue: 120 }],
                {
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
                false,
                undefined,
                [],
                {},
                [],
                undefined,
                [['Active filters'], ['No active filters applied'], []],
            );

            expect(appendCsvToSheet).toHaveBeenCalledWith(
                'refresh-token',
                'file-id',
                [
                    ['Active filters'],
                    ['No active filters applied'],
                    [],
                    ['Total revenue'],
                    [120],
                ],
                undefined,
                [],
            );
        });

        test('should write filter summary rows when the query has no results', async () => {
            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

            const appendCsvToSheet = vi
                .spyOn(client, 'appendCsvToSheet')
                .mockResolvedValue(undefined);

            await client.appendToSheet(
                'refresh-token',
                'file-id',
                [],
                {},
                false,
                undefined,
                [],
                {},
                [],
                undefined,
                [['Active filters'], ['No active filters applied'], []],
            );

            expect(appendCsvToSheet).toHaveBeenCalledWith(
                'refresh-token',
                'file-id',
                [['Active filters'], ['No active filters applied'], [], []],
                undefined,
                [],
            );
        });

        test('should write supported date dimensions as native Google Sheets values', async () => {
            vi.mocked(google.auth.fromJSON).mockReturnValue({} as never);
            vi.mocked(google.auth.GoogleAuth).mockImplementation(
                function MockGoogleAuth(this: object) {
                    return this;
                } as never,
            );
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            vi.mocked(google.sheets).mockReturnValue(fake.api() as never);

            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

            await client.appendToSheet(
                'refresh-token',
                'file-id',
                [
                    {
                        orders_order_date: '2023-03-15',
                        orders_order_quarter: '2023-01-01',
                        orders_total_revenue: 120,
                    },
                    {
                        orders_order_date: null,
                        orders_order_quarter: '2023-04-01',
                        orders_total_revenue: 80,
                    },
                ],
                {
                    orders_order_date: {
                        name: 'order_date',
                        label: 'Order date',
                        type: DimensionType.DATE,
                        table: 'orders',
                        tableLabel: 'Orders',
                        fieldType: FieldType.DIMENSION,
                        timeInterval: TimeFrames.DAY,
                        sql: '${TABLE}.order_date',
                        hidden: false,
                    } as Dimension,
                    orders_order_quarter: {
                        name: 'order_quarter',
                        label: 'Order quarter',
                        type: DimensionType.DATE,
                        table: 'orders',
                        tableLabel: 'Orders',
                        fieldType: FieldType.DIMENSION,
                        timeInterval: TimeFrames.QUARTER,
                        sql: '${TABLE}.order_date',
                        hidden: false,
                    } as Dimension,
                    orders_total_revenue: {
                        name: 'total_revenue',
                        label: 'Total revenue',
                        type: DimensionType.NUMBER,
                        table: 'orders',
                        tableLabel: 'Orders',
                        fieldType: FieldType.DIMENSION,
                        sql: '${TABLE}.total_revenue',
                        hidden: false,
                    },
                },
                false,
                undefined,
                [
                    'orders_order_date',
                    'orders_order_quarter',
                    'orders_total_revenue',
                ],
            );

            expect(fake.tabValues('Sheet1')).toEqual([
                ['Order date', 'Order quarter', 'Total revenue'],
                [45000, '2023-Q1', 120],
                ['NaT', '2023-Q2', 80],
            ]);
            expect(fake.sheet('Sheet1').numberFormats).toEqual([
                {
                    range: {
                        sheetId: fake.sheet('Sheet1').sheetId,
                        startRowIndex: 1,
                        endRowIndex: 3,
                        startColumnIndex: 0,
                        endColumnIndex: 1,
                    },
                    numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' },
                },
            ]);
        });
    });

    // Sheet writes pass `retry: false` to gaxios and use our own bounded
    // retry, so Retry-After only reaches the caller if we extract it here.
    describe('error classification', () => {
        const makeClient = () =>
            new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

        beforeEach(() => {
            vi.mocked(google.auth.fromJSON).mockReturnValue({} as never);
            // Constructed via `new` in getCredentials — an arrow function
            // implementation isn't constructable.
            vi.mocked(google.auth.GoogleAuth).mockImplementation(
                function MockGoogleAuth(this: object) {
                    return this;
                } as never,
            );
        });

        test('carries a Retry-After header as retryAfterMs on the thrown GoogleSheetsQuotaError', async () => {
            const get = vi.fn().mockRejectedValue({
                message: 'Quota exceeded for quota metric Write requests',
                response: { headers: { 'retry-after': '7' } },
            });
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            const client = makeClient();

            await expect(
                client.assertFileIsGoogleSheet('refresh-token', 'file-id'),
            ).rejects.toMatchObject({
                name: 'GoogleSheetsQuotaError',
                data: { retryAfterMs: 7000 },
            });
        });

        test('leaves retryAfterMs undefined when there is no Retry-After header', async () => {
            const get = vi.fn().mockRejectedValue({
                message: 'Quota exceeded for quota metric Write requests',
                response: { headers: {} },
            });
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            const client = makeClient();

            let caught: unknown;
            try {
                await client.assertFileIsGoogleSheet(
                    'refresh-token',
                    'file-id',
                );
            } catch (e) {
                caught = e;
            }

            expect(caught).toBeInstanceOf(GoogleSheetsQuotaError);
            expect(
                (caught as GoogleSheetsQuotaError).data.retryAfterMs,
            ).toBeUndefined();
        });

        // gaxios 5 / node-fetch 2 surface a network-level failure (no HTTP
        // response) as a FetchError with a system errno; token refresh too.
        const fetchError = (
            message: string,
            props: { type: string; code?: string },
        ) =>
            Object.assign(new Error(message), { name: 'FetchError', ...props });

        test.each([
            fetchError(
                'request to https://oauth2.googleapis.com/token failed, reason: socket hang up',
                { type: 'system', code: 'ECONNRESET' },
            ),
            fetchError(
                'request to https://sheets.googleapis.com/v4/spreadsheets/x failed, reason: getaddrinfo ENOTFOUND sheets.googleapis.com',
                { type: 'system', code: 'ENOTFOUND' },
            ),
            fetchError(
                'network timeout at: https://oauth2.googleapis.com/token',
                {
                    type: 'request-timeout',
                },
            ),
        ])(
            'classifies a no-response network failure as GoogleSheetsTransientError: $message',
            async (networkError) => {
                const get = vi.fn().mockRejectedValue(networkError);
                vi.mocked(google.sheets).mockReturnValue({
                    spreadsheets: { get },
                } as never);

                await expect(
                    makeClient().assertFileIsGoogleSheet(
                        'refresh-token',
                        'file-id',
                    ),
                ).rejects.toMatchObject({
                    name: 'GoogleSheetsTransientError',
                    message: networkError.message,
                });
            },
        );

        test('classifies a no-response error carrying a network errno code as GoogleSheetsTransientError', async () => {
            const get = vi.fn().mockRejectedValue(
                Object.assign(new Error('read ECONNRESET'), {
                    code: 'ECONNRESET',
                }),
            );
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            await expect(
                makeClient().assertFileIsGoogleSheet(
                    'refresh-token',
                    'file-id',
                ),
            ).rejects.toMatchObject({ name: 'GoogleSheetsTransientError' });
        });

        // The token refresh runs inside the first Sheets call of a write.
        // Google's token endpoint can answer "internal_failure"; a sync must
        // retry it, not turn itself off.
        test.each([500, 503])(
            'classifies an internal_failure from the Google token endpoint (HTTP %s) as GoogleSheetsTransientError',
            async (status) => {
                const get = vi
                    .fn()
                    .mockRejectedValue(
                        googleOAuthError(status, 'internal_failure'),
                    );
                vi.mocked(google.sheets).mockReturnValue({
                    spreadsheets: { get },
                } as never);

                await expect(
                    makeClient().assertFileIsGoogleSheet(
                        'refresh-token',
                        'file-id',
                    ),
                ).rejects.toMatchObject({
                    name: 'GoogleSheetsTransientError',
                    message: 'internal_failure',
                });
            },
        );

        test('keeps invalid_grant from the token endpoint as a ForbiddenError', async () => {
            const get = vi
                .fn()
                .mockRejectedValue(googleOAuthError(400, 'invalid_grant'));
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            await expect(
                makeClient().assertFileIsGoogleSheet(
                    'refresh-token',
                    'file-id',
                ),
            ).rejects.toMatchObject({ name: 'ForbiddenError' });
        });

        test('keeps a non-network error without a response as UnexpectedGoogleSheetsError', async () => {
            const get = vi
                .fn()
                .mockRejectedValue(new TypeError('Cannot read properties'));
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            await expect(
                makeClient().assertFileIsGoogleSheet(
                    'refresh-token',
                    'file-id',
                ),
            ).rejects.toMatchObject({
                name: 'UnexpectedGoogleSheetsError',
                message: 'Cannot read properties',
            });
        });

        test('keeps an unrecognised error that did get an HTTP response as UnexpectedGoogleSheetsError', async () => {
            const get = vi.fn().mockRejectedValue(
                Object.assign(
                    new Error('Request failed with status code 500'),
                    {
                        code: 'ECONNRESET',
                        response: { status: 500, data: {} },
                    },
                ),
            );
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: { get },
            } as never);

            await expect(
                makeClient().assertFileIsGoogleSheet(
                    'refresh-token',
                    'file-id',
                ),
            ).rejects.toMatchObject({ name: 'UnexpectedGoogleSheetsError' });
        });
    });

    describe('large writes', () => {
        const makeClient = () =>
            new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

        const useFake = (fake: GoogleSheetsFake) => {
            vi.mocked(google.auth.fromJSON).mockReturnValue({} as never);
            vi.mocked(google.auth.GoogleAuth).mockImplementation(
                function MockGoogleAuth(this: object) {
                    return this;
                } as never,
            );
            vi.mocked(google.sheets).mockReturnValue(fake.api() as never);
        };

        const makeRows = (count: number, prefix = 'row') => [
            ['id', 'hash'],
            ...Array.from({ length: count }, (_, i) => [
                i + 1,
                `${prefix}-${i + 1}-${'x'.repeat(64)}`,
            ]),
        ];

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        // Google fails a single values.update with "Internal error
        // encountered" once it holds more than ~187k rows with a long text
        // column, so no request may come near that row count.
        test('splits a large result into requests of at most 25,000 rows', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            const rows = makeRows(120_000);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(
                Math.max(...fake.updateCalls.map((call) => call.rows.length)),
            ).toBeLessThanOrEqual(25_000);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('keeps the old rows in the tab when Google fails the write', async () => {
            const oldRows = makeRows(1_000, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            fake.beforeUpdate = () => {
                throw googleInternalError();
            };

            const result = makeClient()
                .appendCsvToSheet('refresh-token', 'file-id', makeRows(5_000))
                .catch((e) => e);
            await vi.runAllTimersAsync();

            expect(await result).toBeInstanceOf(Error);
            expect(fake.tabValues('Sheet1').length).toBe(oldRows.length);
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
        });

        const settle = async (promise: Promise<unknown>) => {
            const settled = promise.then(
                () => undefined,
                (e: unknown) => e,
            );
            await vi.runAllTimersAsync();
            return settled;
        };

        test('writes the header in the first request and swaps the data in without a leftover tab', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(1_000, 'old') },
                { title: 'Summary', rows: [['total', 1]] },
            ]);
            useFake(fake);
            const { sheetId } = fake.sheet('Sheet1');
            const rows = makeRows(60_000);
            const tabsDuringWrite: Array<{ title: string; hidden: boolean }> =
                [];
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    tabsDuringWrite.push(
                        ...fake.sheets.map(({ title, hidden }) => ({
                            title,
                            hidden,
                        })),
                    );
                }
            };

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(tabsDuringWrite).toEqual([
                { title: 'Sheet1', hidden: false },
                { title: 'Summary', hidden: false },
                {
                    title: expect.stringMatching(
                        /^Lightdash sync in progress [0-9a-f]{8}-[0-9a-z]{9}-[0-9a-f]{4}$/,
                    ),
                    hidden: true,
                },
            ]);
            expect(fake.updateCalls).toHaveLength(3);
            expect(fake.updateCalls[0].range).toMatch(/!A1$/);
            expect(fake.updateCalls[0].rows[0]).toEqual(['id', 'hash']);
            expect(fake.updateCalls.map((call) => call.options)).toEqual(
                fake.updateCalls.map(() => ({ retry: false })),
            );
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Summary',
            ]);
            expect(fake.sheet('Sheet1').sheetId).toBe(sheetId);
            expect(fake.clearCalls).toEqual([]);
        });

        test('leaves no stale rows or columns when the new result is smaller', async () => {
            const fake = new GoogleSheetsFake([
                {
                    title: 'Sheet1',
                    rows: Array.from({ length: 50 }, (_, i) => [
                        i,
                        'old',
                        'old',
                        'old',
                    ]),
                },
            ]);
            useFake(fake);

            await makeClient().appendCsvToSheet('refresh-token', 'file-id', [
                ['a', 'b'],
                [1, null],
            ]);

            expect(fake.tabValues('Sheet1')).toEqual([['a', 'b'], [1]]);
        });

        test('retries a chunk after a quota error and completes the write', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 1) throw googleQuotaError();
            };
            const rows = makeRows(60_000);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.updateCalls).toHaveLength(4);
            expect(fake.updateCalls[2].range).toBe(fake.updateCalls[1].range);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('waits for the Retry-After time before it retries a chunk', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    throw Object.assign(googleQuotaError(), {
                        response: {
                            status: 429,
                            headers: { 'retry-after': '20' },
                        },
                    });
                }
            };

            const write = makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );
            await vi.advanceTimersByTimeAsync(19_000);
            expect(fake.updateCalls).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1_000);
            await write;

            expect(fake.updateCalls).toHaveLength(2);
        });

        test('stops after bounded retries and names the size in the error', async () => {
            const oldRows = makeRows(1_000, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index >= 1) throw googleInternalError();
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(60_000),
                ),
            );

            // One good chunk, then the first try and 3 retries of the next.
            expect(fake.updateCalls).toHaveLength(5);
            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toBe(
                'Google Sheets could not write 60,001 rows (including header rows, about 4.8 MB) to the tab "Sheet1". The data in the tab was not changed. Google error: Google Drive internal error encountered. Please try again later.',
            );
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('keeps the class of a transient error so the job is retried', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = () => {
                throw googleApiError(
                    503,
                    'The service is currently unavailable.',
                );
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsTransientError);
            expect((error as Error).message).toMatch(
                /^Google Sheets could not write 11 rows \(including header rows, less than 0\.1 MB\) to the tab "Sheet1"\. The data in the tab was not changed\./,
            );
        });

        test('keeps the old rows when Google rejects the final swap and the in-place write', async () => {
            const oldRows = makeRows(1_000, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            const cellLimitError = () =>
                googleApiError(
                    400,
                    'This action would increase the number of cells in the workbook above the limit of 20000000 cells.',
                );
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    throw cellLimitError();
                }
            };
            fake.beforeUpdate = (call) => {
                if (call.range.startsWith("'Sheet1'")) throw cellLimitError();
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(30_000),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toContain(
                'The data in the tab was not changed. Google error: This action would increase the number of cells',
            );
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('treats a swap whose response was lost as done when the staging tab is gone', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.afterBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    throw Object.assign(new Error('socket hang up'), {
                        name: 'FetchError',
                        code: 'ECONNRESET',
                    });
                }
            };
            const rows = makeRows(10);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('writes in place when the spreadsheet has no room for a staging tab', async () => {
            const fake = new GoogleSheetsFake([
                {
                    title: 'Sheet1',
                    rows: Array.from({ length: 40_000 }, (_, i) => [
                        `old-${i}`,
                        'old',
                        'old',
                    ]),
                },
                // Sheet1 is 40,000 x 26 cells. The new data fits once, not twice.
                { title: 'Filler', rowCount: 18_930_000, columnCount: 1 },
            ]);
            useFake(fake);
            const rows = [
                ['Active filters'],
                ['id', 'hash'],
                ...Array.from({ length: 30_000 }, (_, i) => [
                    i,
                    i % 2 ? null : `new-${i}`,
                ]),
            ];

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Filler',
            ]);
            expect(fake.updateCalls[0].range).toBe("'Sheet1'!A1");
            expect(fake.tabValues('Sheet1')).toEqual(
                rows.map((row) => {
                    const values = row.map((v) => v ?? '');
                    while (values.length > 0 && values.at(-1) === '') {
                        values.pop();
                    }
                    return values;
                }),
            );
        });

        test('grows the tab before an in-place write that needs more rows', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(999, 'old') },
                // Room for the new data once, not twice.
                { title: 'Filler', rowCount: 19_200_000, columnCount: 1 },
            ]);
            useFake(fake);
            const rows = makeRows(30_000);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(fake.updateCalls[1].range).toBe("'Sheet1'!A25001");
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Filler',
            ]);
        });

        test('says the tab can mix old and new rows when an in-place write fails', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(40_000, 'old') },
                { title: 'Filler', rowCount: 18_930_000, columnCount: 1 },
            ]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index >= 1) throw googleInternalError();
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(30_000),
                ),
            );

            expect((error as Error).message).toContain(
                'The sync stopped part-way. Rows 1-25,000 of the tab are new. The rows after them can be from the previous sync until a later run completes. If the sync was turned off, turn it on again to replace them.',
            );
        });

        test('refuses a write that cannot fit the 20M-cell limit before it changes anything', async () => {
            const oldRows = makeRows(1_000, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
                { title: 'Filler', rowCount: 19_800_000, columnCount: 1 },
            ]);
            useFake(fake);

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10_000),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toBe(
                'Google Sheets could not write 10,001 rows and 2 columns to the tab "Sheet1": the spreadsheet would need about 20,060,026 cells, which is more than the Google Sheets limit of 20,000,000 cells. The data in the tab was not changed. Remove tabs or rows that you do not use, or sync fewer rows or columns.',
            );
            expect(fake.updateCalls).toEqual([]);
            expect(fake.batchUpdateCalls).toEqual([]);
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
        });

        test('creates a missing custom tab and removes a staging tab left by an earlier run', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) throw googleApiError(400, 'Bad request');
            };
            await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(5),
                    'Sales:Q1',
                ),
            );
            fake.beforeUpdate = () => {};
            // Simulate a crash that left the hidden staging tab behind.
            const leftover = fake.updateCalls[0].range
                .split('!')[0]
                .slice(1, -1);
            await fake.api().spreadsheets.batchUpdate({
                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: leftover,
                                    hidden: true,
                                },
                            },
                        },
                    ],
                },
            });
            const rows = makeRows(5);

            // The next run starts later than the crashed one.
            vi.setSystemTime(Date.now() + 1000);
            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
                'Sales:Q1',
            );

            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Sales.Q1',
            ]);
            expect(fake.tabValues('Sales.Q1')).toEqual(rows);
            expect(fake.tabValues('Sheet1')).toEqual([]);
        });

        const copyBatches = (fake: GoogleSheetsFake) =>
            fake.batchUpdateCalls
                .map((requests) =>
                    (requests as Array<Record<string, AnyType>>).filter(
                        (r) => 'copyPaste' in r,
                    ),
                )
                .filter((copies) => copies.length > 0);

        const makeWideRows = (count: number, prefix: string) => [
            ['id', 'a', 'b', 'c', 'd', 'e', 'f'],
            ...Array.from({ length: count }, (_, i) => [
                i + 1,
                `${prefix}-${i}`,
                'b',
                'c',
                'd',
                'e',
                `${prefix}-f`,
            ]),
        ];

        test('swaps a large result in batches of at most 100,000 rows and 500,000 cells', async () => {
            const fake = new GoogleSheetsFake([
                {
                    title: 'Sheet1',
                    rows: Array.from({ length: 200_000 }, (_, i) => [
                        `old-${i}`,
                        'old',
                        'old',
                        'old',
                        'old',
                        'old',
                        'old',
                        'old-extra-column',
                    ]),
                },
            ]);
            useFake(fake);
            const rows = makeWideRows(150_000, 'new');

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            const batches = copyBatches(fake);
            expect(batches).toHaveLength(3);
            batches.forEach((copies) => {
                expect(copies).toHaveLength(1);
                const { startRowIndex, endRowIndex } =
                    copies[0].copyPaste.source;
                expect(endRowIndex - startRowIndex).toBeLessThanOrEqual(
                    100_000,
                );
                expect((endRowIndex - startRowIndex) * 7).toBeLessThanOrEqual(
                    500_000,
                );
            });
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('says the tab can mix old and new rows when a later swap batch fails', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
            ]);
            useFake(fake);
            let copyBatch = 0;
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    copyBatch += 1;
                    if (copyBatch >= 2) throw googleInternalError();
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeWideRows(150_000, 'new'),
                ),
            );

            expect((error as Error).message).toBe(
                'Google Sheets could not write 150,001 rows (including header rows, about 6.4 MB) to the tab "Sheet1". The sync stopped part-way. Rows 1-50,000 of the tab are new. The rows after them can be from the previous sync until a later run completes. If the sync was turned off, turn it on again to replace them. Google error: Google Drive internal error encountered. Please try again later.',
            );
            expect(fake.tabValues('Sheet1')[49_999][1]).toBe('new-49998');
            expect(fake.tabValues('Sheet1')[50_000][1]).toBe('old-49999');
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        const addBasicFilter = (
            fake: GoogleSheetsFake,
            hiddenRows: number[],
        ) => {
            const sheet = fake.sheet('Sheet1');
            sheet.basicFilter = {
                range: { sheetId: sheet.sheetId },
                filterSpecs: [{ columnIndex: 0 }],
            };
            sheet.filteredRows = new Set(hiddenRows);
            return sheet.basicFilter;
        };

        test.each([
            ['one swap batch', 10],
            ['several swap batches', 150_000],
        ])(
            'replaces rows that a basic filter hides and keeps the filter (%s)',
            async (_name, count) => {
                const fake = new GoogleSheetsFake([
                    { title: 'Sheet1', rows: makeWideRows(count, 'old') },
                ]);
                useFake(fake);
                const filter = addBasicFilter(fake, [1, 2, 3, 100_000]);
                const rows = makeWideRows(count, 'new');

                await makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    rows,
                );

                expect(fake.tabValues('Sheet1')).toEqual(rows);
                expect(fake.sheet('Sheet1').basicFilter).toEqual(filter);
            },
        );

        test('restores the basic filter when a later swap batch fails', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
            ]);
            useFake(fake);
            const filter = addBasicFilter(fake, [1]);
            let copyBatch = 0;
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    copyBatch += 1;
                    if (copyBatch >= 2) throw googleInternalError();
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeWideRows(150_000, 'new'),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect(fake.sheet('Sheet1').basicFilter).toEqual(filter);
        });

        test('restores a basic filter without its sort, so rows stay in query order', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(20, 'old') },
            ]);
            useFake(fake);
            const filter = addBasicFilter(fake, []);
            filter.sortSpecs = [{ dimensionIndex: 0, sortOrder: 'DESCENDING' }];
            const rows = makeWideRows(30, 'new');

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            const { sortSpecs, ...withoutSort } = filter;
            expect(fake.sheet('Sheet1').basicFilter).toEqual(withoutSort);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        // A filter on a Sheets table is the tab's basic filter. Google reads
        // it back with both tableId and range, and rejects that form in
        // setBasicFilter.
        const addTableFilter = (
            fake: GoogleSheetsFake,
            hiddenRows: number[],
        ) => {
            const sheet = fake.sheet('Sheet1');
            const range = {
                sheetId: sheet.sheetId,
                startRowIndex: 0,
                endRowIndex: sheet.values.length,
                startColumnIndex: 0,
                endColumnIndex: 7,
            };
            sheet.tables = [{ tableId: '1580800616', name: 'Table1', range }];
            sheet.basicFilter = {
                range,
                tableId: '1580800616',
                filterSpecs: [
                    {
                        columnIndex: 1,
                        filterCriteria: { hiddenValues: ['old-2'] },
                    },
                ],
            };
            sheet.filteredRows = new Set(hiddenRows);
            return { filter: sheet.basicFilter, tables: sheet.tables };
        };

        test.each([
            ['the same size', 20, 20],
            ['more rows', 20, 333],
            ['fewer rows', 333, 70],
        ])(
            'syncs a tab whose Sheets table has a filter (%s): every row, hidden rows too, and the filter and table stay',
            async (_name, oldCount, newCount) => {
                const fake = new GoogleSheetsFake([
                    { title: 'Sheet1', rows: makeWideRows(oldCount, 'old') },
                ]);
                useFake(fake);
                const { filter, tables } = addTableFilter(fake, [3, 5]);
                const rows = makeWideRows(newCount, 'new');

                const error = await settle(
                    makeClient().appendCsvToSheet(
                        'refresh-token',
                        'file-id',
                        rows,
                    ),
                );

                expect(error).toBeUndefined();
                expect(fake.tabValues('Sheet1')).toEqual(rows);
                expect(fake.sheet('Sheet1').basicFilter).toEqual(filter);
                expect(fake.sheet('Sheet1').tables).toEqual(tables);
                expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
                // Google rejects a table filter with criteria in any form,
                // so the sync must not take it off and set it back.
                expect(
                    fake.batchUpdateCalls
                        .flat()
                        .some(
                            (r) =>
                                'setBasicFilter' in (r as object) ||
                                'clearBasicFilter' in (r as object),
                        ),
                ).toBe(false);
            },
        );

        test('writes the tab in place when Google rejects the first swap batch, so the sync completes', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(20, 'old') },
            ]);
            useFake(fake);
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    throw googleApiError(
                        400,
                        'Invalid requests[0].copyPaste: A shape that Google does not accept',
                    );
                }
            };
            const rows = makeWideRows(60, 'new');

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('retries a token refresh failure before the write and keeps the old rows', async () => {
            const oldRows = makeRows(10, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            const api = fake.api();
            vi.mocked(google.sheets).mockReturnValue({
                ...api,
                spreadsheets: {
                    ...api.spreadsheets,
                    get: vi
                        .fn()
                        .mockRejectedValue(
                            googleOAuthError(500, 'internal_failure'),
                        ),
                },
            } as never);

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(20),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsTransientError);
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
        });

        // Two runs can write one tab: "Sync now" during a scheduled run, or
        // two schedulers on one tab. Staging tab names carry the start time
        // of their run, and the tab records the run that last claimed it.
        const syncRunId = (ms: number) =>
            `${ms.toString(36).padStart(9, '0')}-ffff`;
        const stagingTitleFor = (tab: string, runId: string) =>
            `Lightdash sync in progress ${createHash('sha256')
                .update(tab.toLowerCase())
                .digest('hex')
                .slice(0, 8)}-${runId}`;
        const addHiddenTab = (fake: GoogleSheetsFake, title: string) => {
            fake.applyNow([
                {
                    addSheet: {
                        properties: {
                            title,
                            hidden: true,
                            gridProperties: { rowCount: 10, columnCount: 2 },
                        },
                    },
                },
            ]);
        };
        const ownStagingTab = (fake: GoogleSheetsFake) =>
            fake.sheets.find(
                (s) =>
                    s.hidden &&
                    s.title.startsWith('Lightdash sync in progress'),
            );
        // What a newer run's claim does to this run.
        const supersede = (fake: GoogleSheetsFake) => {
            const own = ownStagingTab(fake);
            if (!own) throw new Error('No staging tab to supersede');
            fake.applyNow([
                { deleteSheet: { sheetId: own.sheetId } },
                {
                    deleteDeveloperMetadata: {
                        dataFilter: {
                            developerMetadataLookup: {
                                metadataKey: 'lightdash.sync.claim',
                            },
                        },
                    },
                },
                {
                    createDeveloperMetadata: {
                        developerMetadata: {
                            metadataKey: 'lightdash.sync.claim',
                            metadataValue: syncRunId(Date.now() + 60_000),
                            location: { sheetId: fake.sheet('Sheet1').sheetId },
                            visibility: 'DOCUMENT',
                        },
                    },
                },
            ]);
        };

        test('keeps the staging tab of a live run and deletes only stale ones', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            const live = stagingTitleFor(
                'Sheet1',
                syncRunId(Date.now() - 60_000),
            );
            const stale = stagingTitleFor(
                'Sheet1',
                syncRunId(Date.now() - 30 * 60_000),
            );
            const legacy = stagingTitleFor('Sheet1', 'abcdef');
            [live, stale, legacy].forEach((title) => addHiddenTab(fake, title));
            const tabsDuringUpload: string[] = [];
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    tabsDuringUpload.push(...fake.sheets.map((s) => s.title));
                }
            };

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );

            expect(tabsDuringUpload).toContain(live);
            expect(tabsDuringUpload).not.toContain(stale);
            expect(tabsDuringUpload).not.toContain(legacy);
        });

        const networkError = () =>
            Object.assign(new Error('socket hang up'), {
                name: 'FetchError',
                code: 'ECONNRESET',
            });
        const hasRequest = (requests: unknown[], kind: string) =>
            requests.some((r) => kind in (r as object));

        const setClaim = (fake: GoogleSheetsFake, runId: string) =>
            fake.applyNow([
                {
                    createDeveloperMetadata: {
                        developerMetadata: {
                            metadataKey: 'lightdash.sync.claim',
                            metadataValue: runId,
                            location: {
                                sheetId: fake.sheet('Sheet1').sheetId,
                            },
                            visibility: 'DOCUMENT',
                        },
                    },
                },
            ]);

        test('an older run that reaches its claim after a newer run finished stops, and the newer rows stay', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            const newerRows = makeRows(10, 'newer');
            // While this run uploads, a newer run of the same tab completes.
            // The newer run claimed the tab before this run's staging tab
            // existed, so this run's staging tab is still there.
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    fake.sheet('Sheet1').values = newerRows.map((row) => [
                        ...row,
                    ]);
                    setClaim(fake, syncRunId(Date.now() + 60_000));
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10, 'older'),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsSupersededError);
            expect(fake.tabValues('Sheet1')).toEqual(newerRows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test("counts a lost last batch as applied only with this run's done marker, not an earlier run's", async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            const firstRows = makeRows(10, 'first');
            await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    firstRows,
                ),
            );
            expect(
                fake
                    .sheet('Sheet1')
                    .developerMetadata.some(
                        (m) => m.metadataKey === 'lightdash.sync.done',
                    ),
            ).toBe(true);
            vi.setSystemTime(Date.now() + 60_000);
            // The last batch never lands, and its response is lost.
            fake.beforeBatchUpdate = (requests) => {
                if (hasRequest(requests, 'copyPaste')) throw networkError();
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10, 'second'),
                ),
            );

            expect(error).toBeInstanceOf(Error);
            expect(fake.tabValues('Sheet1')).toEqual(firstRows);
        });

        test('ignores a claim more than 5 minutes in the future, from a worker with a wrong clock', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            setClaim(fake, syncRunId(Date.now() + 60 * 60_000));
            const rows = makeRows(20);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('deletes a staging tab dated more than 5 minutes in the future', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            addHiddenTab(
                fake,
                stagingTitleFor('Sheet1', syncRunId(Date.now() + 60 * 60_000)),
            );

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );

            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('claims the tab: deletes staging tabs of older runs and keeps newer ones', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            const older = stagingTitleFor(
                'Sheet1',
                syncRunId(Date.now() - 60_000),
            );
            const newer = stagingTitleFor(
                'Sheet1',
                syncRunId(Date.now() + 60_000),
            );
            [older, newer].forEach((title) => addHiddenTab(fake, title));
            const rows = makeRows(10);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1', newer]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheet('Sheet1').developerMetadata).toContainEqual(
                expect.objectContaining({
                    metadataKey: 'lightdash.sync.claim',
                    metadataValue: expect.stringMatching(
                        /^[0-9a-z]{9}-[0-9a-f]{4}$/,
                    ),
                }),
            );
        });

        test('a run that a newer run supersedes during the upload stops with the superseded outcome', async () => {
            const oldRows = makeRows(10, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 1) supersede(fake);
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(60_000),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsSupersededError);
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('a run that a newer run supersedes between swap batches stops with the superseded outcome', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
            ]);
            useFake(fake);
            let copyBatch = 0;
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    copyBatch += 1;
                    if (copyBatch === 2) supersede(fake);
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeWideRows(150_000, 'new'),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsSupersededError);
            expect(copyBatch).toBe(2);
        });

        test('reports mixed rows when Google rejects the last swap batch because the staging tab is gone', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
            ]);
            useFake(fake);
            let copyBatch = 0;
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    copyBatch += 1;
                    if (copyBatch === 3) {
                        const own = ownStagingTab(fake);
                        fake.applyNow([
                            { deleteSheet: { sheetId: own!.sheetId } },
                        ]);
                    }
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeWideRows(150_000, 'new'),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toContain(
                'The sync stopped part-way. Rows 1-100,000 of the tab are new.',
            );
        });

        test('an in-place run that a newer run supersedes stops writing with the superseded outcome', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(40_000, 'old') },
                // Room for the new data once, not twice.
                { title: 'Filler', rowCount: 18_400_000, columnCount: 1 },
            ]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 1) supersede(fake);
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(60_000),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsSupersededError);
            expect(fake.updateCalls).toHaveLength(2);
            expect(fake.updateCalls[0].range).toBe("'Sheet1'!A1");
        });

        test.each([
            ['two staged runs with several swap batches', 150_000, 150_000, 0],
            ['a large and a small staged run', 150_000, 50, 0],
            ['a small and a large staged run', 50, 150_000, 0],
            ['two in-place runs', 150_000, 150_000, 15_500_000],
        ])(
            'two runs that write one tab at the same time leave the complete data of one run, with no failure (%s)',
            async (_name, sizeA, sizeB, filler) => {
                const fake = new GoogleSheetsFake([
                    { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
                    ...(filler
                        ? [
                              {
                                  title: 'Filler',
                                  rowCount: filler,
                                  columnCount: 1,
                              },
                          ]
                        : []),
                ]);
                useFake(fake);
                const rowsA = makeWideRows(sizeA, 'a');
                const rowsB = makeWideRows(sizeB, 'b');

                const run = (rows: unknown[][]) =>
                    makeClient()
                        .appendCsvToSheet('refresh-token', 'file-id', rows)
                        .then(
                            () => undefined,
                            (e: unknown) => e,
                        );
                const runA = run(rowsA);
                const runB = run(rowsB);
                await vi.runAllTimersAsync();

                // One run completes; the other completes too or stops as
                // superseded, never with an error.
                const outcomes = [await runA, await runB].map((e) =>
                    e === undefined ? 'completed' : (e as Error).name,
                );
                outcomes.forEach((outcome) =>
                    expect([
                        'completed',
                        'GoogleSheetsSupersededError',
                    ]).toContain(outcome),
                );
                expect(outcomes).toContain('completed');
                const values = fake.tabValues('Sheet1');
                const winner =
                    values.length === rowsA.length &&
                    String(values[1][1]).startsWith('a-')
                        ? rowsA
                        : rowsB;
                expect(values.length).toBe(winner.length);
                expect(values).toEqual(winner);
                expect(fake.sheets.map((s) => s.title)).toEqual(
                    filler ? ['Sheet1', 'Filler'] : ['Sheet1'],
                );
            },
        );

        test('says a retried run replaces mixed rows, without asking to turn the sync on', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(40_000, 'old') },
                { title: 'Filler', rowCount: 18_930_000, columnCount: 1 },
            ]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index >= 1) {
                    throw googleApiError(
                        503,
                        'The service is currently unavailable.',
                    );
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(30_000),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsTransientError);
            expect((error as Error).message).toContain(
                'The sync stopped part-way. Rows 1-25,000 of the tab are new. The rows after them can be from the previous sync until a later run completes. Google error:',
            );
        });

        test.each([
            ['a 502', () => googleApiError(502, 'Bad Gateway')],
            ['a 504', () => googleApiError(504, 'Gateway Timeout')],
            ['a 500 Backend Error', () => googleApiError(500, 'Backend Error')],
            [
                'a 429 Rate Limit Exceeded',
                () => googleApiError(429, 'Rate Limit Exceeded'),
            ],
            ['a network error', networkError],
        ])('retries a write that fails with %s', async (_name, error) => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) throw error();
            };
            const rows = makeRows(10);

            const result = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(result).toBeUndefined();
            expect(fake.updateCalls).toHaveLength(2);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('does not retry a 4xx such as a bad request', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = () => {
                throw googleApiError(400, 'Invalid value at data.values');
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect(fake.updateCalls).toHaveLength(1);
        });

        test('keeps the quota class after the retries run out, so the job is retried', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = () => {
                throw googleQuotaError();
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsQuotaError);
            expect(fake.updateCalls).toHaveLength(4);
        });

        test('waits about 5 s, with jitter, before the first retry', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    throw googleApiError(
                        503,
                        'The service is currently unavailable.',
                    );
                }
            };

            const write = makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );
            await vi.advanceTimersByTimeAsync(3_900);
            expect(fake.updateCalls).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(2_200);
            await write;

            expect(fake.updateCalls).toHaveLength(2);
        });

        test('waits at most 60 s for a long Retry-After', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = (_call, index) => {
                if (index === 0) {
                    throw Object.assign(googleQuotaError(), {
                        response: {
                            status: 429,
                            headers: { 'retry-after': '600' },
                        },
                    });
                }
            };

            const write = makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );
            await vi.advanceTimersByTimeAsync(59_000);
            expect(fake.updateCalls).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1_000);
            await write;

            expect(fake.updateCalls).toHaveLength(2);
        });

        test('stops retrying when the retry time for the sync is used up', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            fake.beforeUpdate = () => {
                throw googleApiError(
                    503,
                    'The service is currently unavailable.',
                );
            };
            // 40% of a 60 s job timeout: room for the 5 s and 15 s waits,
            // not for the 45 s one.
            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                    scheduler: { jobTimeout: 60_000 },
                },
            } as never);

            const error = await settle(
                client.appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(GoogleSheetsTransientError);
            expect(fake.updateCalls).toHaveLength(3);
        });

        // GSHEETS_WRITES_PER_APP_ITEM in SchedulerTask paces app syncs by
        // this count: setup, upload, claim and swap.
        test('makes 4 write requests for a small sync', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(100),
            );

            expect(fake.batchUpdateCalls.length + fake.updateCalls.length).toBe(
                4,
            );
        });

        test('writes every request as RAW, so text is never parsed', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(30_000),
            );

            expect(fake.updateCalls.map((c) => c.valueInputOption)).toEqual([
                'RAW',
                'RAW',
            ]);
        });

        test('keeps a stale staging tab of another tab', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1' },
                { title: 'Other' },
            ]);
            useFake(fake);
            const otherStale = stagingTitleFor(
                'Other',
                syncRunId(Date.now() - 30 * 60_000),
            );
            addHiddenTab(fake, otherStale);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                makeRows(10),
            );

            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Other',
                otherStale,
            ]);
        });

        test('does not count a stale staging tab in the cell budget', async () => {
            const stale = stagingTitleFor(
                'Sheet1',
                syncRunId(Date.now() - 30 * 60_000),
            );
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1' },
                { title: stale, rowCount: 19_990_000, columnCount: 1 },
            ]);
            fake.sheet(stale).hidden = true;
            useFake(fake);
            const rows = makeRows(10);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('escapes a quote in the tab name of an in-place write', async () => {
            const fake = new GoogleSheetsFake([
                { title: "Q1's data", rows: makeRows(40_000, 'old') },
                { title: 'Filler', rowCount: 18_930_000, columnCount: 1 },
            ]);
            useFake(fake);
            const rows = makeRows(30_000);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
                "Q1's data",
            );

            expect(fake.updateCalls[0].range).toBe("'Q1''s data'!A1");
            expect(fake.tabValues("Q1's data")).toEqual(rows);
        });

        test('bounds swap batches at 100,000 rows for narrow data', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            const rows = [
                ['id'],
                ...Array.from({ length: 250_000 }, (_, i) => [i + 1]),
            ];

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            const sizes = copyBatches(fake).map(
                ([copy]) =>
                    copy.copyPaste.source.endRowIndex -
                    copy.copyPaste.source.startRowIndex,
            );
            expect(sizes).toEqual([100_000, 100_000, 50_001]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('bounds swap batches by bytes for rows of long text', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            // Four 63-character text columns, about 270 bytes per row. The
            // cells are one character short of the long-cell bound.
            const rows = [
                ['a', 'b', 'c', 'd'],
                ...Array.from({ length: 60_000 }, (_, i) =>
                    ['a', 'b', 'c', 'd'].map((c) => `${c}${i}`.padEnd(63, c)),
                ),
            ];

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            const sizes = copyBatches(fake).map(
                ([copy]) =>
                    copy.copyPaste.source.endRowIndex -
                    copy.copyPaste.source.startRowIndex,
            );
            // 25,000 rows are about 7 MB, so two of them do not fit in 12 MB;
            // the last 10,001 rows (about 2.8 MB) join the second batch.
            expect(sizes).toEqual([25_000, 35_001]);
        });

        const makeLongRows = (count: number, columns: number, prefix = 'v') => [
            Array.from({ length: columns }, (_, c) => `col${c}`),
            ...Array.from({ length: count }, (_row, i) =>
                Array.from({ length: columns }, (_cell, c) =>
                    `${prefix}${i}-${c}-`.padEnd(64, 'x'),
                ),
            ),
        ];
        // Applies the long-cell limit to pastes only.
        const limitPastes = (fake: GoogleSheetsFake, limit: number) => {
            /* eslint-disable no-param-reassign */
            fake.beforeUpdate = () => {
                fake.longCellLimit = Infinity;
            };
            fake.beforeBatchUpdate = (requests) => {
                if (hasRequest(requests, 'copyPaste')) {
                    fake.longCellLimit = limit;
                }
            };
            /* eslint-enable no-param-reassign */
        };
        const copySizes = (fake: GoogleSheetsFake) =>
            copyBatches(fake).map(
                ([copy]) =>
                    copy.copyPaste.source.endRowIndex -
                    copy.copyPaste.source.startRowIndex,
            );

        test('bounds swap batches at 100,000 long cells, under the bytes bound', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            // Two 64-character columns: 75,000 rows fit in 12 MB but hold
            // 150,000 long cells, more than Google takes in one request.
            fake.longCellLimit = 120_000;
            useFake(fake);
            const rows = makeLongRows(120_000, 2);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(copySizes(fake)).toEqual([50_000, 50_000, 20_001]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('bounds write requests at 100,000 long cells', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            fake.longCellLimit = 110_000;
            useFake(fake);
            // Eight 64-character columns: 8 MB holds about 125,000 of them.
            const rows = makeLongRows(30_000, 8);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            fake.updateCalls.forEach((call) =>
                expect(call.rows.length * 8).toBeLessThanOrEqual(100_008),
            );
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('splits a swap batch that Google rejects with "Internal error encountered", without waiting to retry', async () => {
            const oldRows = makeLongRows(1_000, 2, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            fake.longCellLimit = 60_000;
            useFake(fake);
            const rows = makeLongRows(60_000, 2);

            const write = makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );
            // No retry delay is needed: the split halves go at once.
            await vi.advanceTimersByTimeAsync(100);
            await write;

            // 50,000 rows (100,000 long cells) fail; each half passes.
            expect(copySizes(fake)).toEqual([50_000, 25_000, 25_000, 10_001]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('retries a swap batch that fails with a 500 Backend Error, without splitting it', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            let failed = false;
            fake.beforeBatchUpdate = (requests) => {
                if (!failed && hasRequest(requests, 'copyPaste')) {
                    failed = true;
                    throw googleApiError(500, 'Backend Error');
                }
            };
            const rows = makeLongRows(20_000, 2);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(copySizes(fake)).toEqual([20_001, 20_001]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('splits a one-batch swap that Google rejects and still finishes', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeLongRows(1_000, 2, 'old') },
            ]);
            limitPastes(fake, 30_000);
            useFake(fake);
            const rows = makeLongRows(20_000, 2);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(copySizes(fake)).toEqual([20_001, 10_000, 10_001]);
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('does not split below 1,000 rows: it retries, then fails and keeps the old rows', async () => {
            const oldRows = makeLongRows(3_000, 2, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            limitPastes(fake, 1_000);
            useFake(fake);
            const rows = makeLongRows(3_000, 2);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toContain(
                'The data in the tab was not changed.',
            );
            // 3,001 rows split once into 1,500 and 1,501; the first half
            // is too small to split and is tried 4 times.
            expect(copySizes(fake)).toEqual([
                3_001, 1_500, 1_500, 1_500, 1_500,
            ]);
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
        });

        test('takes a 5xx on the last batch as done when the batch landed', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            let failed = false;
            fake.afterBatchUpdate = (requests) => {
                if (!failed && hasRequest(requests, 'copyPaste')) {
                    failed = true;
                    throw googleApiError(503, 'Backend Error');
                }
            };
            const rows = makeRows(10);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
        });

        test('does not take a lost response as done when the batch did not land', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            fake.beforeBatchUpdate = (requests) => {
                if (hasRequest(requests, 'copyPaste')) {
                    const own = ownStagingTab(fake);
                    if (own) {
                        fake.applyNow([
                            { deleteSheet: { sheetId: own.sheetId } },
                        ]);
                    }
                    throw networkError();
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(Error);
            expect(fake.tabValues('Sheet1')).toEqual(makeRows(10, 'old'));
        });

        test('reports a 4xx on a one-batch swap as no change, also when the staging tab is gone', async () => {
            const oldRows = makeRows(10, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            fake.beforeBatchUpdate = (requests) => {
                if (hasRequest(requests, 'copyPaste')) {
                    const own = ownStagingTab(fake);
                    fake.applyNow([{ deleteSheet: { sheetId: own!.sheetId } }]);
                    throw googleApiError(
                        400,
                        `No grid with id: ${own!.sheetId}`,
                    );
                }
            };

            const error = await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeRows(10),
                ),
            );

            expect(error).toBeInstanceOf(UnexpectedGoogleSheetsError);
            expect((error as Error).message).toContain(
                'The data in the tab was not changed.',
            );
            expect(fake.tabValues('Sheet1')).toEqual(oldRows);
        });

        test('takes a lost response on the in-place finish as done when it landed', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeRows(40_000, 'old') },
                { title: 'Filler', rowCount: 18_930_000, columnCount: 1 },
            ]);
            useFake(fake);
            let failed = false;
            fake.afterBatchUpdate = (requests) => {
                const done = (requests as Array<Record<string, AnyType>>).some(
                    (r) =>
                        r.createDeveloperMetadata?.developerMetadata
                            ?.metadataKey === 'lightdash.sync.done',
                );
                if (done && !failed) {
                    failed = true;
                    throw networkError();
                }
            };
            const rows = makeRows(30_000);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual([
                'Sheet1',
                'Filler',
            ]);
        });

        test('recovers when the response to the tab setup is lost', async () => {
            const fake = new GoogleSheetsFake([{ title: 'Sheet1' }]);
            useFake(fake);
            let failed = false;
            fake.afterBatchUpdate = (requests) => {
                if (!failed && hasRequest(requests, 'addSheet')) {
                    failed = true;
                    throw networkError();
                }
            };
            const rows = makeRows(10);

            const error = await settle(
                makeClient().appendCsvToSheet('refresh-token', 'file-id', rows),
            );

            expect(error).toBeUndefined();
            expect(fake.tabValues('Sheet1')).toEqual(rows);
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
        });

        test('keeps the basic filter on when a run stops between swap batches', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: makeWideRows(150_000, 'old') },
            ]);
            useFake(fake);
            const filter = addBasicFilter(fake, [1]);
            let copyBatch = 0;
            fake.beforeBatchUpdate = (requests) => {
                if (hasRequest(requests, 'copyPaste')) {
                    copyBatch += 1;
                    if (copyBatch >= 2) throw googleApiError(400, 'Stopped');
                }
            };

            await settle(
                makeClient().appendCsvToSheet(
                    'refresh-token',
                    'file-id',
                    makeWideRows(150_000, 'new'),
                ),
            );

            expect(fake.sheet('Sheet1').basicFilter).toEqual(filter);
            fake.batchUpdateCalls
                .filter((requests) => hasRequest(requests, 'clearBasicFilter'))
                .forEach((requests) =>
                    expect(hasRequest(requests, 'setBasicFilter')).toBe(true),
                );
        });

        test('writes into an existing tab whose name differs only in case', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'revenue', rows: makeRows(10, 'old') },
            ]);
            useFake(fake);
            const rows = makeRows(20);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
                'Revenue',
            );

            expect(fake.sheets.map((s) => s.title)).toEqual(['revenue']);
            expect(fake.tabValues('revenue')).toEqual(rows);
        });

        test('writes to the first visible tab when no tab name is set', async () => {
            const fake = new GoogleSheetsFake([
                { title: 'Hidden', rows: [['keep']] },
                { title: 'Visible' },
            ]);
            fake.sheet('Hidden').hidden = true;
            useFake(fake);
            const rows = makeRows(3);

            await makeClient().appendCsvToSheet(
                'refresh-token',
                'file-id',
                rows,
            );

            expect(fake.tabValues('Visible')).toEqual(rows);
            expect(fake.tabValues('Hidden')).toEqual([['keep']]);
        });
    });

    describe('planGoogleSheetsWriteChunks', () => {
        test('covers every row once and bounds each chunk by rows and bytes', () => {
            const rows = Array.from({ length: 1_000 }, (_, i) => [
                i,
                'x'.repeat(i % 10 === 0 ? 500 : 10),
            ]);

            const { chunks, totalBytes } = planGoogleSheetsWriteChunks(
                rows,
                300,
                4_000,
            );

            expect(chunks[0].start).toBe(0);
            expect(chunks.at(-1)?.end).toBe(rows.length);
            chunks.forEach((chunk, i) => {
                expect(chunk.end - chunk.start).toBeLessThanOrEqual(300);
                expect(chunk.bytes).toBeLessThanOrEqual(4_000);
                if (i > 0) expect(chunk.start).toBe(chunks[i - 1].end);
            });
            expect(chunks.reduce((acc, c) => acc + c.bytes, 0)).toBe(
                totalBytes,
            );
        });

        test('keeps a row that is larger than the byte bound in its own chunk', () => {
            const { chunks } = planGoogleSheetsWriteChunks(
                [['small'], ['x'.repeat(100)], ['small']],
                10,
                50,
            );

            expect(chunks.map(({ start, end }) => [start, end])).toEqual([
                [0, 1],
                [1, 2],
                [2, 3],
            ]);
        });

        test('uses the 250,000-cell bound for wide rows', () => {
            const { chunks } = planGoogleSheetsWriteChunks(
                Array.from({ length: 10_000 }, () => Array(60).fill(1)),
            );

            expect(chunks.map((c) => c.end - c.start)).toEqual([
                4_166, 4_166, 1_668,
            ]);
        });

        test('uses the 25,000-row bound for narrow rows', () => {
            const { chunks } = planGoogleSheetsWriteChunks(
                Array.from({ length: 60_001 }, () => [1]),
            );

            expect(chunks.map((c) => c.end - c.start)).toEqual([
                25_000, 25_000, 10_001,
            ]);
        });
    });

    describe('row batches', () => {
        test('reads bounded A1 ranges without loading the full tab', async () => {
            vi.mocked(google.auth.fromJSON).mockReturnValue({} as never);
            vi.mocked(google.auth.GoogleAuth).mockImplementation(
                function MockGoogleAuth(this: object) {
                    return this;
                } as never,
            );
            const getMetadata = vi.fn().mockResolvedValue({
                data: {
                    sheets: [
                        {
                            properties: {
                                title: "Q1's data",
                                gridProperties: {
                                    rowCount: 5,
                                    columnCount: 28,
                                },
                            },
                        },
                    ],
                },
            });
            const getValues = vi
                .fn()
                .mockResolvedValueOnce({ data: { values: [['h'], ['a']] } })
                .mockResolvedValueOnce({ data: { values: [['b'], ['c']] } })
                .mockResolvedValueOnce({ data: { values: [['d']] } });
            vi.mocked(google.sheets).mockReturnValue({
                spreadsheets: {
                    get: getMetadata,
                    values: { get: getValues },
                },
            } as never);
            const client = new GoogleDriveClient({
                lightdashConfig: {
                    auth: {
                        google: {
                            oauth2ClientId: 'client-id',
                            oauth2ClientSecret: 'client-secret',
                        },
                    },
                },
            } as never);

            const batches: unknown[][][] = [];
            // eslint-disable-next-line no-restricted-syntax
            for await (const batch of client.getSheetRowBatches(
                'refresh-token',
                'file-id',
                "Q1's data",
                2,
            )) {
                batches.push(batch);
            }

            expect(batches).toHaveLength(3);
            expect(
                getValues.mock.calls.map(([request]) => request.range),
            ).toEqual([
                "'Q1''s data'!A1:AB2",
                "'Q1''s data'!A3:AB4",
                "'Q1''s data'!A5:AB5",
            ]);
        });
    });
});
