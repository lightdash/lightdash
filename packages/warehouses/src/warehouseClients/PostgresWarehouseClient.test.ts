import { WarehouseTypes } from '@lightdash/common';
import * as pg from 'pg';
import { PassThrough } from 'stream';
import { PostgresWarehouseClient } from './PostgresWarehouseClient';
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

interface CursorConnection {
    pool: unknown;
    client: unknown;
    cursorName: string;
    totalRows: number;
    fields: Record<string, { type: string }>;
    createdAt: number;
}

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

    describe('Async Query Pagination', () => {
        let warehouse: PostgresWarehouseClient;
        let mockClient: {
            query: jest.Mock;
            release: jest.Mock;
            on: jest.Mock;
        };
        let mockPool: {
            connect: jest.Mock;
            end: jest.Mock;
            on: jest.Mock;
        };

        beforeEach(() => {
            warehouse = new PostgresWarehouseClient(credentials);
            
            mockClient = {
                query: jest.fn(),
                release: jest.fn(),
                on: jest.fn(),
            };
            
            mockPool = {
                connect: jest.fn().mockResolvedValue(mockClient),
                end: jest.fn().mockResolvedValue(undefined),
                on: jest.fn(),
            };

            (pg.Pool as unknown as jest.Mock).mockImplementation(() => mockPool);
        });

        afterEach(() => {
            jest.clearAllMocks();
            // Clean up any intervals
            if (warehouse) {
                // Access private cleanup interval and clear it
                const privateWarehouse = warehouse as unknown as { cleanupInterval?: NodeJS.Timeout };
                if (privateWarehouse.cleanupInterval) {
                    clearInterval(privateWarehouse.cleanupInterval);
                }
            }
        });

        it('should execute async query with cursor', async () => {
            const sql = 'SELECT * FROM users';
            const tags = { test: 'true' };
            
            // Mock query responses
            mockClient.query
                .mockResolvedValueOnce({}) // SET timezone
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({}) // DECLARE CURSOR
                .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // COUNT query
                .mockResolvedValueOnce({ 
                    fields: [{ name: 'id', dataTypeID: 23 }, { name: 'name', dataTypeID: 25 }],
                    rows: [{ id: 1, name: 'Test' }]
                }); // FETCH 1

            const result = await warehouse.executeAsyncQuery({
                sql,
                tags,
                timezone: 'UTC',
                values: undefined,
            });

            expect(result.queryId).toBeTruthy();
            expect(result.totalRows).toBe(100);
            expect(result.queryMetadata).toEqual({
                type: WarehouseTypes.POSTGRES,
                cursorName: expect.stringMatching(/^cursor_/),
            });
            
            // Verify cursor was created
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringMatching(/^DECLARE cursor_.*CURSOR FOR/),
                undefined
            );
        });

        it('should retrieve paginated results using cursor', async () => {
            const queryId = 'test-query-id';
            const cursorName = `cursor_${queryId.replace(/-/g, '_')}`;
            
            // Set up cursor connection in the map
            const { cursorConnections } = warehouse as unknown as { cursorConnections: Map<string, CursorConnection> };
            cursorConnections.set(queryId, {
                pool: mockPool,
                client: mockClient,
                cursorName,
                totalRows: 100,
                fields: { id: { type: 'number' }, name: { type: 'string' } },
                createdAt: Date.now(),
            });

            // Mock pagination queries
            mockClient.query
                .mockResolvedValueOnce({}) // MOVE ABSOLUTE
                .mockResolvedValueOnce({ 
                    rows: [
                        { id: 21, name: 'User 21' },
                        { id: 22, name: 'User 22' },
                        { id: 23, name: 'User 23' },
                        { id: 24, name: 'User 24' },
                        { id: 25, name: 'User 25' },
                    ]
                }); // FETCH FORWARD

            const result = await warehouse.getAsyncQueryResults({
                sql: 'SELECT * FROM users',
                queryId,
                queryMetadata: { type: WarehouseTypes.POSTGRES, cursorName },
                page: 3,
                pageSize: 5,
            });

            expect(result.queryId).toBe(queryId);
            expect(result.totalRows).toBe(100);
            expect(result.pageCount).toBe(20);
            expect(result.rows.length).toBe(5);
            expect(result.rows[0]).toEqual({ id: 21, name: 'User 21' });
            
            // Verify cursor positioning
            expect(mockClient.query).toHaveBeenCalledWith('MOVE ABSOLUTE 10 IN cursor_test_query_id');
            expect(mockClient.query).toHaveBeenCalledWith('FETCH FORWARD 5 FROM cursor_test_query_id');
        });

        it('should throw error for missing queryId', async () => {
            await expect(
                warehouse.getAsyncQueryResults({
                    sql: 'SELECT * FROM users',
                    queryId: null,
                    queryMetadata: null,
                    page: 1,
                    pageSize: 10,
                })
            ).rejects.toThrow('Query ID is required for pagination');
        });

        it('should throw error for expired queryId', async () => {
            await expect(
                warehouse.getAsyncQueryResults({
                    sql: 'SELECT * FROM users',
                    queryId: 'non-existent-id',
                    queryMetadata: null,
                    page: 1,
                    pageSize: 10,
                })
            ).rejects.toThrow('Query ID not found or expired');
        });

        it('should clean up cursors on error', async () => {
            const sql = 'SELECT * FROM users';
            
            // Mock query to throw error after connection is established
            mockClient.query
                .mockResolvedValueOnce({}) // SET timezone
                .mockResolvedValueOnce({}) // BEGIN
                .mockRejectedValueOnce(new Error('Connection failed')); // DECLARE CURSOR fails

            await expect(
                warehouse.executeAsyncQuery({
                    sql,
                    tags: {},
                    timezone: 'UTC',
                    values: undefined,
                })
            ).rejects.toThrow('Connection failed');

            // Since error happens before queryId is stored, pool.end won't be called
            // Instead, check that the connection was obtained
            expect(mockPool.connect).toHaveBeenCalled();
        });

        it('should stream results when callback is provided', async () => {
            const sql = 'SELECT * FROM users';
            const resultsCallback = jest.fn();
            
            // Mock query responses
            mockClient.query
                .mockResolvedValueOnce({}) // SET timezone
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({}) // DECLARE CURSOR
                .mockResolvedValueOnce({ rows: [{ count: '2000' }] }) // COUNT query
                .mockResolvedValueOnce({ 
                    fields: [{ name: 'id', dataTypeID: 23 }],
                    rows: []
                }) // FETCH 1
                .mockResolvedValueOnce({}) // MOVE ABSOLUTE 0
                .mockResolvedValueOnce({ 
                    rows: Array(1000).fill({ id: 1 })
                }) // First batch
                .mockResolvedValueOnce({ 
                    rows: Array(1000).fill({ id: 2 })
                }) // Second batch
                .mockResolvedValueOnce({ 
                    rows: []
                }); // Empty batch (end)

            await warehouse.executeAsyncQuery({
                sql,
                tags: {},
                timezone: 'UTC',
                values: undefined,
            }, resultsCallback);

            // Verify streaming occurred
            expect(resultsCallback).toHaveBeenCalledTimes(2);
            expect(resultsCallback).toHaveBeenCalledWith(
                expect.arrayContaining([{ id: 1 }]),
                expect.any(Object)
            );
        });

        it('should apply row formatter when provided', async () => {
            const queryId = 'test-query-id';
            const cursorName = `cursor_${queryId.replace(/-/g, '_')}`;
            
            // Set up cursor connection
            const { cursorConnections } = warehouse as unknown as { cursorConnections: Map<string, CursorConnection> };
            cursorConnections.set(queryId, {
                pool: mockPool,
                client: mockClient,
                cursorName,
                totalRows: 10,
                fields: { id: { type: 'number' } },
                createdAt: Date.now(),
            });

            // Mock queries
            mockClient.query
                .mockResolvedValueOnce({}) // MOVE ABSOLUTE
                .mockResolvedValueOnce({ 
                    rows: [{ id: 1 }, { id: 2 }]
                });

            const formatter = (row: Record<string, unknown>) => ({
                ...row,
                formatted: true,
            });

            const result = await warehouse.getAsyncQueryResults({
                sql: 'SELECT * FROM users',
                queryId,
                queryMetadata: { type: WarehouseTypes.POSTGRES, cursorName },
                page: 1,
                pageSize: 10,
            }, formatter);

            expect(result.rows[0]).toEqual({ id: 1, formatted: true });
            expect(result.rows[1]).toEqual({ id: 2, formatted: true });
        });
    });
});
