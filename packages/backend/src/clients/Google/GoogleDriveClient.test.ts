import {
    AnyType,
    DimensionType,
    FieldType,
    GoogleSheetsQuotaError,
    GoogleSheetsTransientError,
    TimeFrames,
    UnexpectedGoogleSheetsError,
    type Dimension,
} from '@lightdash/common';
import { google } from 'googleapis';
import {
    GoogleDriveClient,
    planGoogleSheetsWriteChunks,
} from './GoogleDriveClient';
import {
    googleApiError,
    googleInternalError,
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
        test('splits a large result into requests of at most 50,000 rows', async () => {
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
            ).toBeLessThanOrEqual(50_000);
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
                        /^Lightdash sync in progress [0-9a-f]{8}-[0-9a-f]{6}$/,
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
                'Google Sheets could not write 60,001 rows (including the header, about 4.8 MB) to the tab "Sheet1". The data in the tab was not changed. Google error: Google Drive internal error encountered. Please try again later.',
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
                /^Google Sheets could not write 11 rows .* to the tab "Sheet1"\. The data in the tab was not changed\./,
            );
        });

        test('keeps the old rows when Google rejects the final swap', async () => {
            const oldRows = makeRows(1_000, 'old');
            const fake = new GoogleSheetsFake([
                { title: 'Sheet1', rows: oldRows },
            ]);
            useFake(fake);
            fake.beforeBatchUpdate = (requests) => {
                if (requests.some((r) => 'copyPaste' in (r as object))) {
                    throw googleApiError(
                        400,
                        'This action would increase the number of cells in the workbook above the limit of 20000000 cells.',
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
                'The sync stopped part-way. Rows 1-25,000 of the tab are new, and the rest may be from the previous sync. The next successful sync replaces them.',
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
                'Google Sheets could not write 150,001 rows (including the header, about 6.4 MB) to the tab "Sheet1". The sync stopped part-way. Rows 1-71,428 of the tab are new, and the rest may be from the previous sync. The next successful sync replaces them. Google error: Google Drive internal error encountered. Please try again later.',
            );
            expect(fake.tabValues('Sheet1')[71_427][1]).toBe('new-71426');
            expect(fake.tabValues('Sheet1')[71_428][1]).toBe('old-71427');
            expect(fake.sheets.map((s) => s.title)).toEqual(['Sheet1']);
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
