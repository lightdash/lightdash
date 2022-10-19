import {
    assertUnreachable,
    CreateDatabricksCredentials,
    DimensionType,
    ParseError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { DBSQLClient } from '@lightdash/databricks-sql';
import IDBSQLClient, {
    ConnectionOptions,
} from '@lightdash/databricks-sql/dist/contracts/IDBSQLClient';
import IDBSQLSession from '@lightdash/databricks-sql/dist/contracts/IDBSQLSession';
import IOperation from '@lightdash/databricks-sql/dist/contracts/IOperation';
import { TTypeId as DatabricksDataTypes } from '@lightdash/databricks-sql/thrift/TCLIService_types';
import { WarehouseCatalog, WarehouseClient } from '../types';

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

const convertDataTypeToDimensionType = (
    type: DatabricksDataTypes,
): DimensionType => {
    switch (type) {
        case DatabricksDataTypes.BOOLEAN_TYPE:
            return DimensionType.BOOLEAN;
        case DatabricksDataTypes.TINYINT_TYPE:
        case DatabricksDataTypes.SMALLINT_TYPE:
        case DatabricksDataTypes.INT_TYPE:
        case DatabricksDataTypes.BIGINT_TYPE:
        case DatabricksDataTypes.FLOAT_TYPE:
        case DatabricksDataTypes.DOUBLE_TYPE:
        case DatabricksDataTypes.DECIMAL_TYPE:
            return DimensionType.NUMBER;
        case DatabricksDataTypes.DATE_TYPE:
            return DimensionType.DATE;
        case DatabricksDataTypes.TIMESTAMP_TYPE:
            return DimensionType.TIMESTAMP;
        case DatabricksDataTypes.STRING_TYPE:
        case DatabricksDataTypes.BINARY_TYPE:
        case DatabricksDataTypes.ARRAY_TYPE:
        case DatabricksDataTypes.STRUCT_TYPE:
        case DatabricksDataTypes.UNION_TYPE:
        case DatabricksDataTypes.USER_DEFINED_TYPE:
        case DatabricksDataTypes.INTERVAL_YEAR_MONTH_TYPE:
        case DatabricksDataTypes.INTERVAL_DAY_TIME_TYPE:
        case DatabricksDataTypes.NULL_TYPE:
        case DatabricksDataTypes.MAP_TYPE:
        case DatabricksDataTypes.CHAR_TYPE:
        case DatabricksDataTypes.VARCHAR_TYPE:
            return DimensionType.STRING;
        default:
            return assertUnreachable(type);
    }
};

enum DatabricksTypes {
    BOOLEAN = 'BOOLEAN',
    BYTE = 'BYTE',
    TINYINT = 'TINYINT',
    SHORT = 'SHORT',
    SMALLINT = 'SMALLINT',
    INT = 'INT',
    INTEGER = 'INTEGER',
    LONG = 'LONG',
    BIGINT = 'BIGINT',
    FLOAT = 'FLOAT',
    REAL = 'REAL',
    DOUBLE = 'DOUBLE',
    DATE = 'DATE',
    TIMESTAMP = 'TIMESTAMP',
    STRING = 'STRING',
    BINARY = 'BINARY',
    DECIMAL = 'DECIMAL',
    DEC = 'DEC',
    NUMERIC = 'NUMERIC',
    INTERVAL = 'INTERVAL', // INTERVAL HOUR
    ARRAY = 'ARRAY', // ARRAY<type>
    STRUCT = 'STRUCT', // STRUCT<type,type...>
    MAP = 'MAP',
    CHAR = 'CHAR',
    VARCHAR = 'VARCHAR',
}

const normaliseDatabricksType = (type: string): DatabricksTypes => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Databricks: ${type}`,
            {},
        );
    }
    return match[0] as DatabricksTypes;
};

const mapFieldType = (type: string): DimensionType => {
    const normalizedType = normaliseDatabricksType(type);

    switch (normalizedType) {
        case DatabricksTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DatabricksTypes.TINYINT:
        case DatabricksTypes.SHORT:
        case DatabricksTypes.SMALLINT:
        case DatabricksTypes.INT:
        case DatabricksTypes.INTEGER:
        case DatabricksTypes.BIGINT:
        case DatabricksTypes.LONG:
        case DatabricksTypes.FLOAT:
        case DatabricksTypes.REAL:
        case DatabricksTypes.DOUBLE:
        case DatabricksTypes.DECIMAL:
        case DatabricksTypes.DEC:
        case DatabricksTypes.NUMERIC:
            return DimensionType.NUMBER;
        case DatabricksTypes.STRING:
        case DatabricksTypes.BINARY:
        case DatabricksTypes.INTERVAL:
        case DatabricksTypes.ARRAY:
        case DatabricksTypes.STRUCT:
        case DatabricksTypes.MAP:
        case DatabricksTypes.CHAR:
        case DatabricksTypes.VARCHAR:
        case DatabricksTypes.BYTE:
            return DimensionType.STRING;
        case DatabricksTypes.DATE:
            return DimensionType.DATE;
        case DatabricksTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        default:
            return assertUnreachable(normalizedType);
    }
};

export class DatabricksWarehouseClient implements WarehouseClient {
    schema: string;

    catalog?: string;

    connectionOptions: ConnectionOptions;

    constructor({
        serverHostName,
        personalAccessToken,
        httpPath,
        // this supposed to be a `schema` but changing it will break for existing customers
        database: schema,
        catalog,
    }: CreateDatabricksCredentials) {
        this.schema = schema;
        this.catalog = catalog;
        this.connectionOptions = {
            token: personalAccessToken,
            host: serverHostName,
            path: httpPath.startsWith('/') ? httpPath : `/${httpPath}`,
        };
    }

    private async getSession() {
        const client = new DBSQLClient();
        let connection: IDBSQLClient;
        let session: IDBSQLSession;

        try {
            connection = await client.connect(this.connectionOptions);

            session = await connection.openSession({
                initialCatalog: this.catalog,
                initialSchema: this.schema,
            });
        } catch (e: any) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                await session.close();
                await connection.close();
            },
        };
    }

    async runQuery(sql: string) {
        const { session, close } = await this.getSession();
        let query: IOperation | null = null;

        try {
            query = await session.executeStatement(sql);

            const result = await query.fetchAll();
            const schema = await query.getSchema();

            const fields = (schema?.columns ?? []).reduce<
                Record<string, { type: DimensionType }>
            >(
                (acc, column) => ({
                    ...acc,
                    [column.columnName]: {
                        type: convertDataTypeToDimensionType(
                            column.typeDesc.types[0]?.primitiveEntry?.type ??
                                DatabricksDataTypes.STRING_TYPE,
                        ),
                    },
                }),
                {},
            );

            return { fields, rows: result };
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            if (query) await query.close();
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
        const { session, close } = await this.getSession();
        let results: SchemaResult[][];

        try {
            const promises = requests.map(async (request) => {
                let query: IOperation | null = null;
                try {
                    query = await session.getColumns({
                        catalogName: request.database,
                        schemaName: request.schema,
                        tableName: request.table,
                    });

                    const result = (await query.fetchAll()) as SchemaResult[];

                    return result;
                } catch (e: any) {
                    throw new WarehouseQueryError(e.message);
                } finally {
                    if (query) query.close();
                }
            });
            results = await Promise.all(promises);
        } finally {
            await close();
        }

        const catalog = this.catalog || 'DEFAULT';
        return results.reduce<WarehouseCatalog>(
            (acc, result, index) => {
                const columns = Object.fromEntries<DimensionType>(
                    result.map((col) => [
                        col.COLUMN_NAME,
                        mapFieldType(col.TYPE_NAME),
                    ]),
                );
                const { schema, table } = requests[index];

                acc[catalog][schema] = acc[catalog][schema] || {};
                acc[catalog][schema][table] = columns;

                return acc;
            },
            { [catalog]: {} } as WarehouseCatalog,
        );
    }
}
