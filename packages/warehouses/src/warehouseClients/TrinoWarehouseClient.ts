import {
    BasicAuth,
    Columns,
    ConnectionOptions,
    Iterator,
    QueryData,
    QueryResult,
    Trino,
} from 'trino-client';

import {
    CreateTrinoCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { WarehouseCatalog, WarehouseClient } from '../types';

export enum TrinoTypes {
    INTEGER = 'integer',
    INT = 'int',
    INT2 = 'int2',
    INT4 = 'int4',
    INT8 = 'int8',
    MONEY = 'money',
    SMALLSERIAL = 'smallserial',
    SERIAL = 'serial',
    SERIAL2 = 'serial2',
    SERIAL4 = 'serial4',
    SERIAL8 = 'serial8',
    BIGSERIAL = 'bigserial',
    BIGINT = 'bigint',
    SMALLINT = 'smallint',
    BOOLEAN = 'boolean',
    BOOL = 'bool',
    DATE = 'date',
    DOUBLE_PRECISION = 'double precision',
    FLOAT = 'float',
    FLOAT4 = 'float4',
    FLOAT8 = 'float8',
    JSON = 'json',
    JSONB = 'jsonb',
    NUMERIC = 'numeric',
    DECIMAL = 'decimal',
    REAL = 'real',
    CHAR = 'char',
    CHARACTER = 'character',
    NCHAR = 'nchar',
    BPCHAR = 'bpchar',
    VARCHAR = 'varchar',
    CHARACTER_VARYING = 'character varying',
    NVARCHAR = 'nvarchar',
    TEXT = 'text',
    TIME = 'time',
    TIME_TZ = 'timetz',
    TIME_WITHOUT_TIME_ZONE = 'time without time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamptz',
    TIMESTAMP_WITHOUT_TIME_ZONE = 'timestamp without time zone',
}

// const mapFieldType = (type: string): DimensionType => {
//     switch (type) {
//         case TrinoTypes.DECIMAL:
//         case TrinoTypes.NUMERIC:
//         case TrinoTypes.INTEGER:
//         case TrinoTypes.MONEY:
//         case TrinoTypes.SMALLSERIAL:
//         case TrinoTypes.SERIAL:
//         case TrinoTypes.SERIAL2:
//         case TrinoTypes.SERIAL4:
//         case TrinoTypes.SERIAL8:
//         case TrinoTypes.BIGSERIAL:
//         case TrinoTypes.INT2:
//         case TrinoTypes.INT4:
//         case TrinoTypes.INT8:
//         case TrinoTypes.BIGINT:
//         case TrinoTypes.SMALLINT:
//         case TrinoTypes.FLOAT:
//         case TrinoTypes.FLOAT4:
//         case TrinoTypes.FLOAT8:
//         case TrinoTypes.DOUBLE_PRECISION:
//         case TrinoTypes.REAL:
//             return DimensionType.NUMBER;
//         case TrinoTypes.DATE:
//             return DimensionType.DATE;
//         case TrinoTypes.TIME:
//         case TrinoTypes.TIME_TZ:
//         case TrinoTypes.TIMESTAMP:
//         case TrinoTypes.TIMESTAMP_TZ:
//         case TrinoTypes.TIME_WITHOUT_TIME_ZONE:
//         case TrinoTypes.TIMESTAMP_WITHOUT_TIME_ZONE:
//             return DimensionType.TIMESTAMP;
//         case TrinoTypes.BOOLEAN:
//         case TrinoTypes.BOOL:
//             return DimensionType.BOOLEAN;
//         default:
//             return DimensionType.STRING;
//     }
// };

// const { builtins } = pg.types;

// const convertDataTypeIdToDimensionType = (
//     dataTypeId: number,
// ): DimensionType => {
//     switch (dataTypeId) {
//         case builtins.NUMERIC:
//         case builtins.MONEY:
//         case builtins.INT2:
//         case builtins.INT4:
//         case builtins.INT8:
//         case builtins.FLOAT4:
//         case builtins.FLOAT8:
//             return DimensionType.NUMBER;
//         case builtins.DATE:
//             return DimensionType.DATE;
//         case builtins.TIME:
//         case builtins.TIMETZ:
//         case builtins.TIMESTAMP:
//         case builtins.TIMESTAMPTZ:
//             return DimensionType.TIMESTAMP;
//         case builtins.BOOL:
//             return DimensionType.BOOLEAN;
//         default:
//             return DimensionType.STRING;
//     }
// };

export class TrinoWarehouseClient implements WarehouseClient {
    connectionOptions: ConnectionOptions;

    constructor({
        host,
        user,
        password,
        port,
        dbname,
        schema,
    }: // catalog,
    CreateTrinoCredentials) {
        this.connectionOptions = {
            auth: new BasicAuth(user, password),
            catalog: dbname,
            schema,
            server: `https://${host}:${port}`,
        };
    }

    private async getSession() {
        const client = Trino;
        let session: Trino;
        try {
            session = await client.create(this.connectionOptions);
        } catch (e: any) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                console.warn('Close trino connection');
            },
        };
    }

    async runQuery(sql: string) {
        const { session, close } = await this.getSession();
        let query: Iterator<QueryResult>;

        try {
            query = await session.query(sql);

            const result: QueryData = (await query.next()).value.data;
            const schema: Columns = (await query.next()).value.columns;

            const fields = schema.reduce(
                (acc, column) => ({
                    ...acc,
                    [column.name]: {
                        // TODO fazer tratamento de tipos aqui
                        type: column.type,
                    },
                }),
                {},
            );

            return { fields, rows: result };
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await close();
        }
    }

    async test(): Promise<void> {
        await this.runQuery('SELECT 1');
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        this.test();
        return {
            teste_db: {
                teste_schema: {
                    teste_table: { teste_column: DimensionType.BOOLEAN },
                },
            },
        };
    }
}
