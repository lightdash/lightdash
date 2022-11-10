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
import { WarehouseClient } from '../types';

export enum TrinoTypes {
    BOOLEAN = 'boolean',
    TINYINT = 'tinyint',
    SMALLINT = 'smallint',
    INTEGER = 'integer',
    BIGINT = 'bigint',
    REAL = 'real',
    DOUBLE = 'double',
    DECIMAL = 'decimal',
    VARCHAR = 'varchar',
    CHAR = 'char',
    VARBINARY = 'varbinary',
    JSON = 'json',
    DATE = 'date',
    TIME = 'time',
    TIME_TZ = 'time(3) with time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamp(3) with time zone',
    INTERVAL_YEAR_MONTH = 'interval year to month',
    INTERVAL_DAY_TIME = 'interval day to second',
    ARRAY = 'array',
    MAP = 'map',
    ROW = 'row',
    IPADDRESS = 'ipaddress',
    UUID = 'uuid',
}

const convertDataTypeToDimensionType = (
    type: TrinoTypes | string,
): DimensionType => {
    switch (type) {
        case TrinoTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case TrinoTypes.TINYINT:
            return DimensionType.NUMBER;
        case TrinoTypes.SMALLINT:
            return DimensionType.NUMBER;
        case TrinoTypes.INTEGER:
            return DimensionType.NUMBER;
        case TrinoTypes.BIGINT:
            return DimensionType.NUMBER;
        case TrinoTypes.REAL:
            return DimensionType.NUMBER;
        case TrinoTypes.DOUBLE:
            return DimensionType.NUMBER;
        case TrinoTypes.DECIMAL:
            return DimensionType.NUMBER;

        case TrinoTypes.DATE:
            return DimensionType.DATE;
        case TrinoTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

export class TrinoWarehouseClient implements WarehouseClient {
    connectionOptions: ConnectionOptions;

    constructor({
        host,
        user,
        password,
        port,
        dbname,
        schema,
    }: CreateTrinoCredentials) {
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

        console.warn('FUNCTION: TrinoWarehouseClient.runQuery');

        try {
            console.log(sql);
            query = await session.query(sql);
            console.log(query);
            const { id } = (await query.next()).value;
            const result: QueryData = (await query.next()).value.data ?? [];
            const schema: {
                name: string;
                type: string;
                typeSignature: { rawType: string };
            }[] = (await query.next()).value.columns ?? [];

            console.log(result);

            const fields = schema.reduce(
                (acc, column) => ({
                    ...acc,
                    [column.name]: {
                        type: convertDataTypeToDimensionType(
                            column.typeSignature.rawType ?? TrinoTypes.VARCHAR,
                        ),
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
        await this.runQuery(`select 
        true as "boolean"
      , CAST(1 as tinyint) as "tinyint"
      , CAST(1 as SMALLINT) as "SMALLINT"
      , CAST(1 as INTEGER) as "INTEGER"
      , CAST(1 as BIGINT) as "BIGINT"
      , CAST('10.3' as REAL) as "REAL"
      , CAST('10.3' as DOUBLE) as "DOUBLE"
      , CAST('10.3' as DECIMAL) as "DECIMAL"
      , CAST('alo' as varchar) as "varchar"
      , CAST('alo' as char) as "char"
      , CAST('alo' as VARBINARY) as "VARBINARY"
      , CAST('alo' as JSON) as "JSON"
      , CAST(NOW() as DATE) as "DATE"
      , CAST(NOW() as TIME) as "TIME"
      , CAST(NOW() as TIME WITH TIME ZONE) as "TIME WITH TIME ZONE"
      , CAST(NOW() as TIMESTAMP) as "TIMESTAMP"
      , CAST(NOW() as TIMESTAMP WITH TIME ZONE) as "TIMESTAMP WITH TIME ZONE"
      , INTERVAL '3' year as "INTERVAL YEAR"
      , INTERVAL '3' MONTH as "INTERVAL YEAR TO MONTH"
      , INTERVAL '2' day as "INTERVAL DAY TO SECOND"
      , ARRAY[1, 2, 3] as "ARRAY"
      , JSON '{"foo": 1, "bar": 2}' as "JSON"
      , MAP(ARRAY['foo', 'bar'], ARRAY[1, 2]) as "MAP"
      , ROW(1, 2.0) as "ROW"
      , IPADDRESS '10.0.0.1' as "IPADDRESS"
      , UUID '12151fd2-7586-11e9-8f9e-2a86e4085a59' as "uuid"    
      `);
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
