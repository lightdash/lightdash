import {
    CreateTrinoCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import * as _ from 'lodash';
import {
    BasicAuth,
    Columns,
    ConnectionOptions,
    Iterator,
    QueryData,
    QueryResult,
    Trino,
} from 'trino-client';
import { WarehouseCatalog, WarehouseClient } from '../types';

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

type SchemaResult = {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: number;
    TYPE_NAME: string;
    // additional props
    // COLUMN_SIZE: null,
    // BUFFER_LENGTH: null,
    // DECIMAL_DIGITS: null,
    // NUM_PREC_RADIX: null,
    // NULLABLE: 1,
    // REMARKS: '',
    // COLUMN_DEF: null,
    // SQL_DATA_TYPE: null,
    // SQL_DATETIME_SUB: null,
    // CHAR_OCTET_LENGTH: null,
    // ORDINAL_POSITION: 5,
    // IS_NULLABLE: 'YES',
    // SCOPE_CATALOG: null,
    // SCOPE_SCHEMA: null,
    // SCOPE_TABLE: null,
    // SOURCE_DATA_TYPE: null,
    // IS_AUTO_INCREMENT: 'NO'
};

interface TableInfo {
    database: string;
    schema: string;
    table: string;
}

const queryTableSchema = ({ database, schema, table }: TableInfo) => `SELECT
                                                                    table_catalog 
                                                                    , table_schema 
                                                                    , table_name
                                                                    , column_name 
                                                                    , data_type 
                                                                    FROM ${database}.information_schema.columns 
                                                                    WHERE table_catalog = '${database}'
                                                                    AND table_schema = '${schema}'
                                                                    AND table_name = '${table}'
                                                                    ORDER BY 1, 2, 3, ordinal_position`;

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

type CatalaogDetails = string | string[];

interface CatalogItemGroup {
    [key: string]: string[][];
}

const customGroup = (arr: any): CatalogItemGroup =>
    _.groupBy(arr, (e) => e.shift());

const keyName = (k: [string, string[][]]): string => _.first(k)?.toString()!;

const handlerVals = (val: string | string[][]): string => val[0][0]!;

const catalogToSchema = (catalog: string[][]): WarehouseCatalog => {
    const schema: WarehouseCatalog = {};
    const groupSchema = customGroup(catalog);
    // TODO tem alguma forma mais elegante de fazer isso?
    Object.entries(groupSchema).map((db) => {
        const dbKey: string = keyName(db);
        const dbValue: CatalogItemGroup = customGroup(_.last(db));
        schema[dbKey] = {};
        Object.entries(dbValue).map((value) => {
            const schemaKey: string = keyName(value);
            const schemaValue: CatalogItemGroup = customGroup(_.last(value));
            schema[dbKey][schemaKey] = {};
            Object.entries(schemaValue).map((schemaItem) => {
                const columnsKey: string = keyName(schemaItem);
                const columnValue: CatalogItemGroup = customGroup(
                    _.last(schemaItem),
                );
                schema[dbKey][schemaKey][columnsKey] = {};

                Object.entries(columnValue).map((column) => {
                    const itemName: string = keyName(column);
                    const item: string = handlerVals(_.last(column)!);
                    schema[dbKey][schemaKey][columnsKey][itemName] =
                        convertDataTypeToDimensionType(item);
                    return null;
                });
                return null;
            });
            return null;
        });
        return null;
    });

    return schema;
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

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const { session, close } = await this.getSession();
        let results: string[][];

        try {
            const promises = requests.map(async (request) => {
                let query: Iterator<QueryResult> | null = null;

                try {
                    query = await session.query(queryTableSchema(request));
                    const result = (await query.next()).value.data ?? [];

                    return result;
                } catch (e: any) {
                    throw new WarehouseQueryError(e.message);
                } finally {
                    if (query) close();
                }
            });

            results = await Promise.all(promises);
        } finally {
            await close();
        }

        console.warn('FUNCTION: TrinoWarehouseClient.getCatalog');
        return catalogToSchema(results);
    }
}
