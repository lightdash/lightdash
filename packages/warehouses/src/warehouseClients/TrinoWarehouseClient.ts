import {
    CreateTrinoCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import * as _ from 'lodash';
import {
    BasicAuth,
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
    TIME_TZ = 'time with time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamp with time zone',
    INTERVAL_YEAR_MONTH = 'interval year to month',
    INTERVAL_DAY_TIME = 'interval day to second',
    ARRAY = 'array',
    MAP = 'map',
    ROW = 'row',
    IPADDRESS = 'ipaddress',
    UUID = 'uuid',
}

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
        case TrinoTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

interface CatalogItemGroup {
    [key: string]: string[][];
}

const customGroup = (arr: any): CatalogItemGroup =>
    _.groupBy(arr, (e) => e.shift());

const keyName = (k: [string, string[][]]): string => _.first(k)?.toString()!;

const handlerVals = (val: string | string[][]): string => val[0][0]!;

const catalogToSchema = (catalog: string[][][]): WarehouseCatalog => {
    const schema: WarehouseCatalog = {};
    const groupSchema = customGroup(_.first(catalog));
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

const resultHandler = (schema: { [key: string]: any }[], data: any[][]) => {
    const s: string[] = schema.map((e) => e.name);
    return data.map((i) => {
        const item: { [key: string]: any } = {};
        i.map((column, index) => {
            const name: string = s[index];
            item[name] = column;
            return null;
        });
        return item;
    });
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
        http_scheme,
    }: CreateTrinoCredentials) {
        this.connectionOptions = {
            auth: new BasicAuth(user, password),
            catalog: dbname,
            schema,
            server: `${http_scheme}://${host}:${port}`,
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
                console.log('Close trino connection');
            },
        };
    }

    async runQuery(sql: string) {
        const { session, close } = await this.getSession();
        let query: Iterator<QueryResult>;

        try {
            query = await session.query(sql);
            const result: QueryData = (await query.next()).value.data ?? [];
            console.log(result);
            const schema: {
                name: string;
                type: string;
                typeSignature: { rawType: string };
            }[] = (await query.next()).value.columns ?? [];

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

            return { fields, rows: resultHandler(schema, result) };
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await close();
        }
    }

    async test(): Promise<void> {
        await this.runQuery(`SELECT 1`);
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const { session, close } = await this.getSession();
        let results: string[][][];

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
        return catalogToSchema(results);
    }
}
