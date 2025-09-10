import { DimensionType, type ResultRow } from '@lightdash/common';
import { createConnection } from 'snowflake-sdk';
import { Readable } from 'stream';
import {
    mapFieldType,
    SnowflakeWarehouseClient,
} from './SnowflakeWarehouseClient';
import {
    columns,
    credentials,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
    queryColumnsMock,
} from './SnowflakeWarehouseClient.mock';
import { config } from './WarehouseClient.mock';

const mockStreamRows = () =>
    new Readable({
        objectMode: true,
        read() {
            this.push(expectedRow);
            this.push(null);
        },
    });

const executeMock = jest.fn(({ sqlText, complete }) => {
    complete(
        undefined,
        {
            streamRows: mockStreamRows,
            getColumns: () => queryColumnsMock,
            getQueryId: () => 'queryId',
            getSqlText: () => sqlText,
        },
        [],
    );
});

const getResultsFromQueryIdMock = jest.fn(({ sqlText, queryId }) => ({
    streamRows: mockStreamRows,
    getColumns: () => queryColumnsMock,
    getQueryId: () => queryId,
    getNumRows: () => 1,
}));

jest.mock('snowflake-sdk', () => ({
    ...jest.requireActual('snowflake-sdk'),
    createConnection: jest.fn(() => ({
        connect: jest.fn((callback) => callback(null, {})),
        execute: executeMock,
        destroy: jest.fn((callback) => callback(null, {})),
        getResultsFromQueryId: getResultsFromQueryIdMock,
        getQueryStatus: jest.fn(() => 'SUCCESS'),
        isStillRunning: jest.fn(() => false),
    })),
}));

describe('SnowflakeWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
    });
    it('expect schema with snowflake types mapped to dimension types', async () => {
        (createConnection as jest.Mock).mockImplementationOnce(() => ({
            connect: jest.fn((callback) => callback(null, {})),
            execute: jest.fn(({ sqlText, complete }) => {
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    columns,
                );
            }),
            destroy: jest.fn((callback) => callback(null, {})),
        }));
        const warehouse = new SnowflakeWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
});

describe('SnowflakeTypeParsing', () => {
    it('expect NUMBER(x,x) to be a number', () => {
        expect(mapFieldType('NUMBER(12,10)')).toEqual(DimensionType.NUMBER);
    });
    it('expect VARCHAR(x) to be a string', () => {
        expect(mapFieldType('VARCHAR(12)')).toEqual(DimensionType.STRING);
    });
});

describe('SnowflakeErrorParsing', () => {
    let warehouse: SnowflakeWarehouseClient;
    const originalEnv = process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;

    beforeEach(() => {
        warehouse = new SnowflakeWarehouseClient(credentials);
    });

    afterEach(() => {
        // Restore original environment variable
        if (originalEnv) {
            process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE = originalEnv;
        } else {
            delete process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;
        }
    });

    it('should return custom error message when SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE is set', () => {
        // Set environment variable
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message:
                "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "You don't have access to the EVENTS table. Please go to 'analytics_JAFFLE' in sailpoint and request access",
        );
    });

    it('should return original error message when SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE is not set', () => {
        // Make sure environment variable is not set
        delete process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;

        const error = {
            message:
                "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
        );
    });

    it('should return original error message for non-unauthorized errors', () => {
        // Set environment variable
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message: 'Some other SQL error',
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Some other SQL error');
    });

    it('should handle table names with different formats', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            'Access denied for {snowflakeTable} in {snowflakeSchema}';

        const error = {
            message:
                "Object 'DB.MY_SCHEMA.MY_TABLE' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Access denied for MY_TABLE in MY_SCHEMA');
    });

    it('should handle errors without table information gracefully', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message:
                "Object 'INCOMPLETE_TABLE_NAME' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        // Should still use custom message but without variable replacement
        expect(result.message).toBe(
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access",
        );
    });
});
