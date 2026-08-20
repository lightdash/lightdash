import {
    DimensionType,
    FieldType,
    GoogleSheetsQuotaError,
} from '@lightdash/common';
import { google } from 'googleapis';
import { GoogleDriveClient } from './GoogleDriveClient';

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
            );
        });
    });

    // gaxios never retries our requests (nothing sets `retry`/`retryConfig`
    // on them) — Retry-After only reaches the caller if we extract it here.
    describe('quota errors', () => {
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
