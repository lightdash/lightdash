/* eslint-disable @typescript-eslint/no-floating-promises */
import {
    AnyType,
    DimensionType,
    QueryExecutionContext,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { Columns, Iterator, QueryData, QueryResult, Trino } from 'trino-client';
import {
    TrinoSqlBuilder,
    TrinoTypes,
    TrinoWarehouseClient,
} from './TrinoWarehouseClient';
import {
    credentials,
    queryResponse,
    querySchemaResponse,
} from './TrinoWarehouseClient.mock';
import * as warehouseClient from './WarehouseClient.mock';

const queryResultMock = vi.fn();

vi.mock('trino-client', () => ({
    BasicAuth: vi.fn(),
    Trino: {
        create: vi.fn(() =>
            Promise.resolve({
                query: queryResultMock,
            }),
        ),
    },
}));

describe('TrinoWarehouseClient', () => {
    const lowerCaseFields = Object.keys(warehouseClient.expectedFields).reduce<
        Record<string, AnyType>
    >((acc, key) => {
        acc[key.toLowerCase()] = warehouseClient.expectedFields[key];
        return acc;
    }, {});
    // The mock's number column is a Trino integer, which reports its kind
    lowerCaseFields.mynumbercolumn = {
        ...lowerCaseFields.mynumbercolumn,
        numericKind: { kind: 'integer' },
    };
    const lowerCaseRow = Object.keys(warehouseClient.expectedRow).reduce<
        Record<string, AnyType>
    >((acc, key) => {
        acc[key.toLowerCase()] = warehouseClient.expectedRow[key];
        return acc;
    }, {});
    it('expect query rows', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: vi
                .fn()
                .mockResolvedValue({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(lowerCaseRow);
        expect(results.fields).toEqual(lowerCaseFields);
    });

    it('expect query has mutiple result chunks', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: vi
                .fn()
                // First chunk: has nextUri indicating more data available
                .mockResolvedValueOnce({
                    done: false,
                    value: { ...queryResponse, nextUri: 'http://trino/next' },
                })
                // Second chunk: no nextUri, query complete
                .mockResolvedValueOnce({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(lowerCaseRow);
        expect(results.fields).toEqual(lowerCaseFields);
        expect(results.rows.length).toEqual(2);
    });

    describe('streamQuery timezone', () => {
        beforeEach(() => {
            queryResultMock.mockReset();
            queryResultMock.mockReturnValue({
                next: vi.fn().mockResolvedValue({
                    done: true,
                    value: queryResponse,
                }),
            });
        });

        it('finishes setting the timezone before submitting the tagged query', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            const timezoneNext = vi
                .fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: { nextUri: 'http://trino/timezone/next' },
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: { data: [[true]] },
                })
                .mockResolvedValueOnce({ done: true, value: {} });
            queryResultMock
                .mockReturnValueOnce({ next: timezoneNext })
                .mockImplementationOnce(() => {
                    expect(timezoneNext).toHaveBeenCalledTimes(3);
                    return {
                        next: vi.fn().mockResolvedValue({
                            done: true,
                            value: queryResponse,
                        }),
                    };
                });

            const results = await warehouse.runQuery(
                'SELECT 1',
                { chart_uuid: 'abc-123' },
                'Asia/Kathmandu',
            );

            expect(queryResultMock).toHaveBeenNthCalledWith(
                1,
                "SET TIME ZONE 'Asia/Kathmandu'",
            );
            expect(queryResultMock).toHaveBeenNthCalledWith(2, {
                query: 'SELECT 1\n-- {"chart_uuid":"abc-123"}',
                extraHeaders: { 'X-Trino-Client-Tags': 'chart_uuid=abc-123' },
            });
            expect(results).toEqual({
                fields: lowerCaseFields,
                rows: [lowerCaseRow],
            });
        });

        it.each([false, true])(
            'rejects a timezone error instead of running the SQL (done=%s)',
            async (done) => {
                const warehouse = new TrinoWarehouseClient(credentials);
                const streamCallback = vi.fn();
                queryResultMock.mockReturnValueOnce({
                    next: vi
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: { nextUri: 'http://trino/timezone/next' },
                        })
                        .mockResolvedValueOnce({
                            done,
                            value: {
                                error: {
                                    message:
                                        'Time zone not supported: Invalid/Zone',
                                },
                            },
                        }),
                });

                const result = warehouse.streamQuery(
                    'SELECT 1',
                    streamCallback,
                    {
                        timezone: 'Invalid/Zone',
                    },
                );

                await expect(result).rejects.toBeInstanceOf(
                    WarehouseQueryError,
                );
                await expect(result).rejects.toThrow(
                    'Time zone not supported: Invalid/Zone',
                );
                expect(queryResultMock).toHaveBeenCalledTimes(1);
                expect(streamCallback).not.toHaveBeenCalled();
            },
        );
    });

    it('expect schema with trino types mapped to dimension types', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: vi
                .fn()
                .mockResolvedValue({ done: true, value: querySchemaResponse }),
        });

        await expect(
            warehouse.getCatalog(warehouseClient.config),
        ).resolves.toEqual(
            warehouseClient.expectedWarehouseSchemaWithNaiveTimestamp,
        );
    });

    it('maps decimal precision and scale to a numeric dimension', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: vi.fn().mockResolvedValue({
                done: true,
                value: {
                    ...querySchemaResponse,
                    data: [
                        [
                            'myDatabase',
                            'mySchema',
                            'myTable',
                            'myDecimalColumn',
                            'decimal(18,4)',
                        ],
                    ],
                },
            }),
        });

        const catalog = await warehouse.getCatalog(warehouseClient.config);

        expect(catalog.myDatabase.mySchema.myTable.myDecimalColumn).toEqual(
            DimensionType.NUMBER,
        );
    });

    it.each([false, true])(
        'binds agent headers only for agent sessions (%s)',
        async (agentSession) => {
            const warehouse = new TrinoWarehouseClient(credentials, {
                agentSession,
            });
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1', { agent: 'true' });

            expect(queryResultMock).toHaveBeenLastCalledWith({
                query: 'SELECT 1\n-- {"agent":"true"}',
                extraHeaders: {
                    'X-Trino-Client-Tags': 'agent=true',
                    ...(agentSession
                        ? {
                              'X-Trino-Extra-Credential': 'agent=true',
                              'User-Agent': 'lightdash-ai',
                          }
                        : {}),
                },
            });
        },
    );

    describe('streamQuery client tag headers', () => {
        it('sends X-Trino-Client-Tags header as comma-separated key=value pairs when tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1', {
                dashboard_uuid: 'abc-123',
                chart_uuid: 'def-456',
            });

            expect(queryResultMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraHeaders: expect.objectContaining({
                        'X-Trino-Client-Tags':
                            'dashboard_uuid=abc-123,chart_uuid=def-456',
                    }),
                }),
            );
        });

        it('sanitizes tag values that are unsafe for the header', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1', {
                scheduler_name: 'Weekly report, EMEA 📊',
                query_context: QueryExecutionContext.SCHEDULED_DELIVERY,
            });

            expect(queryResultMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraHeaders: {
                        'X-Trino-Client-Tags':
                            'scheduler_name=Weekly_report__EMEA___,query_context=scheduledDelivery',
                    },
                }),
            );
        });

        it('coerces non-string tag values instead of throwing', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            // graphile-worker job ids arrive as BigInt at runtime despite the
            // Record<string, string> type (global pg INT8 parser override)
            await warehouse.runQuery('SELECT 1', {
                job_id: BigInt(4482031),
                query_context:
                    QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
            } as unknown as Record<string, string>);

            expect(queryResultMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraHeaders: {
                        'X-Trino-Client-Tags':
                            'job_id=4482031,query_context=scheduledGsheetsDashboard',
                    },
                }),
            );
        });

        it('sends query as plain string (no extraHeaders) when no tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1');

            expect(queryResultMock).toHaveBeenCalledWith('SELECT 1');
        });
    });
});

describe('TrinoSqlBuilder temporal literals', () => {
    // Trino rejects zone-suffixed strings cast to plain TIMESTAMP.
    const builder = new TrinoSqlBuilder();
    const epoch = new Date(0);

    it('emits a zone-free TIMESTAMP literal', () => {
        expect(builder.castToTimestamp(epoch)).toBe(
            "TIMESTAMP '1970-01-01 00:00:00.000'",
        );
    });

    it('emits a DATE literal', () => {
        expect(builder.castToDate(epoch)).toBe("DATE '1970-01-01'");
    });

    it('reuses the plain TIMESTAMP literal for naive timestamps', () => {
        expect(builder.castToNaiveTimestamp(epoch)).toBe(
            "TIMESTAMP '1970-01-01 00:00:00.000'",
        );
    });
});

describe('TrinoWarehouseClient getAllTables', () => {
    it('lists tables and views', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        const runQuery = vi.spyOn(warehouse, 'runQuery').mockResolvedValueOnce({
            rows: [
                {
                    table_catalog: 'hive',
                    table_schema: 'analytics',
                    table_name: 'orders_view',
                    table_type: 'VIEW',
                },
            ],
            fields: {},
        });

        const tables = await warehouse.getAllTables();

        const [query] = runQuery.mock.calls[0];
        expect(query).toContain("table_type IN ('BASE TABLE', 'VIEW')");
        expect(tables).toEqual([
            {
                database: 'hive',
                schema: 'analytics',
                table: 'orders_view',
                tableType: 'view',
            },
        ]);
    });
});

describe('Trino sanitized errors', () => {
    const passwordSentinel = 'trino-password-sentinel';
    const headerSentinel = 'trino-authorization-sentinel';
    const expectNoSecrets = (value: unknown, seen = new Set<unknown>()) => {
        if (typeof value === 'string') {
            expect(value).not.toContain(passwordSentinel);
            expect(value).not.toContain(headerSentinel);
        }
        if (typeof value !== 'object' || value === null || seen.has(value))
            return;
        seen.add(value);
        for (const key of Object.getOwnPropertyNames(value)) {
            expect(key).not.toMatch(/password|header|config|auth/i);
            if (key !== 'cause')
                expectNoSecrets((value as Record<string, unknown>)[key], seen);
        }
        if ('cause' in value) expectNoSecrets(value.cause, seen);
    };
    const axiosError = (status: number) =>
        Object.assign(new Error(`Request failed with status code ${status}`), {
            isAxiosError: true,
            response: { status, headers: { Authorization: headerSentinel } },
            config: {
                auth: { username: 'agent', password: passwordSentinel },
            },
        });
    it.each([401, 403, 404])(
        'keeps only status for query HTTP %s',
        async (status) => {
            queryResultMock.mockRejectedValueOnce(axiosError(status));
            const warehouse = new TrinoWarehouseClient(credentials);
            const error = await warehouse
                .runQuery('SELECT current_user')
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(WarehouseQueryError);
            expect(error).toMatchObject({
                message: `Request failed with status code ${status}`,
                cause: { status },
            });
            expect((error as Error).cause).toStrictEqual({ status });
            expectNoSecrets(error);
        },
    );
    it('sanitizes an HTTP failure while fetching the first result', async () => {
        queryResultMock.mockResolvedValueOnce({
            next: vi.fn().mockRejectedValueOnce(axiosError(401)),
        });
        const warehouse = new TrinoWarehouseClient(credentials);
        const error = await warehouse
            .runQuery('SELECT current_user')
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect((error as Error).cause).toStrictEqual({ status: 401 });
        expectNoSecrets(error);
    });
    it('keeps only status for connection errors', async () => {
        vi.mocked(Trino.create).mockRejectedValueOnce(axiosError(401));
        const warehouse = new TrinoWarehouseClient(credentials);
        const error = await warehouse
            .runQuery('SELECT current_user')
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(WarehouseConnectionError);
        expect((error as Error).cause).toStrictEqual({ status: 401 });
        expectNoSecrets(error);
    });
    it('sanitizes a WarehouseQueryError thrown by a streaming callback', async () => {
        queryResultMock.mockResolvedValueOnce({
            next: vi.fn().mockResolvedValueOnce({
                done: true,
                value: queryResponse,
            }),
        });
        const callbackError = new WarehouseQueryError(
            'Streaming callback failed',
        );
        Object.defineProperty(callbackError, 'cause', {
            value: axiosError(401),
            enumerable: false,
        });
        const streamCallback = vi.fn(() => {
            throw callbackError;
        });
        const warehouse = new TrinoWarehouseClient(credentials);
        const error = await warehouse
            .streamQuery('SELECT current_user', streamCallback, {})
            .catch((e: unknown) => e);

        expect(streamCallback).toHaveBeenCalledOnce();
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect((error as Error).message).toBe(callbackError.message);
        expectNoSecrets(error);
        expect(error).not.toBe(callbackError);
    });
    it('preserves only Trino query error classification', async () => {
        queryResultMock.mockResolvedValueOnce({
            next: vi.fn().mockResolvedValueOnce({
                done: true,
                value: {
                    error: {
                        message: 'Access Denied: Cannot select from table',
                        errorName: 'PERMISSION_DENIED',
                        errorCode: 4,
                        errorType: 'USER_ERROR',
                        failureInfo: { message: passwordSentinel },
                    },
                },
            }),
        });
        const warehouse = new TrinoWarehouseClient(credentials);
        const error = await warehouse
            .runQuery('SELECT * FROM restricted')
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect((error as Error).message).toBe(
            'Access Denied: Cannot select from table',
        );
        expect((error as Error).cause).toStrictEqual({
            errorName: 'PERMISSION_DENIED',
            errorCode: 4,
            errorType: 'USER_ERROR',
        });
        expectNoSecrets(error);
    });
});
