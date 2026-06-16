import { NotSupportedError } from '@lightdash/common';
import * as pg from 'pg';
import { PassThrough } from 'stream';
import {
    PostgresSqlBuilder,
    PostgresWarehouseClient,
} from './PostgresWarehouseClient';
import {
    columns,
    credentials,
    queryColumnsMock,
} from './PostgresWarehouseClient.mock';
import {
    config,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

jest.mock('pg', () => ({
    ...jest.requireActual('pg'),
    Pool: jest.fn(() => ({
        connect: jest.fn((callback) => {
            callback(
                null,
                {
                    query: jest.fn((arg: unknown) => {
                        // Session statements (SET statement_timeout / timezone)
                        // are issued as plain string queries and must return a
                        // thenable, not a stream.
                        if (typeof arg === 'string') {
                            return Promise.resolve({ rows: [], fields: [] });
                        }
                        const mockedStream = new PassThrough();
                        setTimeout(() => {
                            mockedStream.emit('data', {
                                row: expectedRow,
                                fields: queryColumnsMock,
                            });
                            mockedStream.end();
                        }, 100);
                        return mockedStream;
                    }),
                    on: jest.fn(async () => undefined),
                },
                jest.fn(),
            );
        }),
        end: jest.fn(async () => undefined),
        on: jest.fn(async () => undefined),
    })),
}));

describe('PostgresWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');
        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
    });
    it('expect schema with postgres types mapped to dimension types', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        (pg.Pool as unknown as jest.Mock)
            .mockImplementationOnce(() => ({
                connect: jest.fn((callback) => {
                    callback(
                        null,
                        {
                            query: jest.fn((arg: unknown) => {
                                if (typeof arg === 'string') {
                                    return Promise.resolve({
                                        rows: [],
                                        fields: [],
                                    });
                                }
                                const mockedStream = new PassThrough();
                                setTimeout(() => {
                                    mockedStream.emit('data', {
                                        row: { version: 'PostgreSQL 15.4' },
                                        fields: [],
                                    });
                                    mockedStream.end();
                                }, 100);
                                return mockedStream;
                            }),
                            on: jest.fn(async () => undefined),
                        },
                        jest.fn(),
                    );
                }),
                end: jest.fn(async () => undefined),
                on: jest.fn(async () => undefined),
            }))
            .mockImplementationOnce(() => ({
                connect: jest.fn((callback) => {
                    callback(
                        null,
                        {
                            query: jest.fn((arg: unknown) => {
                                if (typeof arg === 'string') {
                                    return Promise.resolve({
                                        rows: [],
                                        fields: [],
                                    });
                                }
                                const mockedStream = new PassThrough();
                                setTimeout(() => {
                                    columns.forEach((column) => {
                                        mockedStream.emit('data', {
                                            row: column,
                                            fields: [],
                                        });
                                    });
                                    mockedStream.end();
                                }, 100);
                                return mockedStream;
                            }),
                            on: jest.fn(async () => undefined),
                        },
                        jest.fn(),
                    );
                }),
                end: jest.fn(async () => undefined),
                on: jest.fn(async () => undefined),
            }));
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
    it('expect empty catalog when dbt project has no references', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        expect(await warehouse.getCatalog([])).toEqual({});
    });
});

describe('PostgresWarehouseClient statement timeout', () => {
    const mockPoolWithQuery = (queryMock: jest.Mock) => {
        (pg.Pool as unknown as jest.Mock).mockImplementationOnce(() => ({
            connect: jest.fn((callback) => {
                callback(null, { query: queryMock, on: jest.fn() }, jest.fn());
            }),
            end: jest.fn(async () => undefined),
            on: jest.fn(),
        }));
    };

    const respondingQueryMock = () =>
        jest.fn((arg: unknown) => {
            if (typeof arg === 'string') {
                return Promise.resolve({ rows: [], fields: [] });
            }
            const stream = new PassThrough();
            setTimeout(() => {
                stream.emit('data', {
                    row: expectedRow,
                    fields: queryColumnsMock,
                });
                stream.end();
            }, 10);
            return stream;
        });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('sets a server-side statement_timeout using the 9-minute default ceiling', async () => {
        const queryMock = respondingQueryMock();
        mockPoolWithQuery(queryMock);
        const warehouse = new PostgresWarehouseClient(credentials);
        await warehouse.runQuery('select 1');
        const sessionStatement = queryMock.mock.calls
            .map((call) => call[0])
            .find((arg) => typeof arg === 'string');
        expect(sessionStatement).toContain('SET statement_timeout = 540000');
    });

    it('honors a configured timeoutSeconds for the statement_timeout', async () => {
        const queryMock = respondingQueryMock();
        mockPoolWithQuery(queryMock);
        const warehouse = new PostgresWarehouseClient({
            ...credentials,
            timeoutSeconds: 120,
        });
        await warehouse.runQuery('select 1');
        const sessionStatement = queryMock.mock.calls
            .map((call) => call[0])
            .find((arg) => typeof arg === 'string');
        expect(sessionStatement).toContain('SET statement_timeout = 120000');
    });

    it('rejects with a timeout error when a query stalls past the client backstop', async () => {
        jest.useFakeTimers();
        const queryMock = jest.fn((arg: unknown) => {
            if (typeof arg === 'string') {
                return Promise.resolve({ rows: [], fields: [] });
            }
            // A stream that never emits or ends — simulates a stalled cursor.
            return new PassThrough();
        });
        mockPoolWithQuery(queryMock);
        const warehouse = new PostgresWarehouseClient(credentials);
        const resultPromise = warehouse.runQuery('select pg_sleep(9999)');
        // Attach the rejection handler before advancing the clock so the
        // rejection is never momentarily unhandled.
        const assertion = expect(resultPromise).rejects.toThrow(
            'Query timed out after 570s',
        );
        // 9-minute statement_timeout + 30s client buffer = 570s
        await jest.advanceTimersByTimeAsync(570 * 1000 + 1000);
        await assertion;
    });
});

describe('PostgresSqlBuilder escaping', () => {
    const postgresSqlBuilder = new PostgresSqlBuilder();

    test('Should not escape regular characters', () => {
        expect(postgresSqlBuilder.escapeString('%')).toBe('%');
        expect(postgresSqlBuilder.escapeString('_')).toBe('_');
        expect(postgresSqlBuilder.escapeString('?')).toBe('?');
        expect(postgresSqlBuilder.escapeString('!')).toBe('!');
        expect(postgresSqlBuilder.escapeString('credit_card')).toBe(
            'credit_card',
        );
    });

    test('Should escape single quotes in postgres', () => {
        expect(postgresSqlBuilder.escapeString("single'quote")).toBe(
            "single''quote",
        );
    });

    test('Should escape backslashes and quotes in postgres', () => {
        expect(postgresSqlBuilder.escapeString("\\') OR (1=1) --")).toBe(
            "\\\\'') OR (1=1) ",
        );
    });

    test('Should handle SQL injection attempts', () => {
        // Test with a typical SQL injection pattern
        const maliciousInput = "'; DROP TABLE users; --";
        const escaped = postgresSqlBuilder.escapeString(maliciousInput);
        expect(escaped).toBe("''; DROP TABLE users; ");

        // Test with another common SQL injection pattern
        const anotherMaliciousInput = "' OR '1'='1";
        const anotherEscaped = postgresSqlBuilder.escapeString(
            anotherMaliciousInput,
        );
        expect(anotherEscaped).toBe("'' OR ''1''=''1");
    });
});

describe('PostgresSqlBuilder array unnesting (unsupported)', () => {
    const postgresSqlBuilder = new PostgresSqlBuilder();

    test('unnestDimension throws a clear NotSupportedError', () => {
        expect(() =>
            postgresSqlBuilder.unnestDimension('"t".tags', 'tags__unnested'),
        ).toThrow(NotSupportedError);
        expect(() =>
            postgresSqlBuilder.unnestDimension('"t".tags', 'tags__unnested'),
        ).toThrow(/not supported for this warehouse/i);
    });
});
