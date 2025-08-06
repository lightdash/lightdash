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
                    query: jest.fn(() => {
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
                            query: jest.fn(() => {
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
                            query: jest.fn(() => {
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

    test('Should escape unicode characters in postgres', () => {
        expect(postgresSqlBuilder.escapeString('single\u2019quote')).toBe(
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
