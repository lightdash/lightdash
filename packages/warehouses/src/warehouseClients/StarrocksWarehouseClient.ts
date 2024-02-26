import {
    CreateStarrocksCredentials,
    DimensionType,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import {
    Connection,
    ConnectionOptions,
    FieldPacket,
    RowDataPacket,
    Types,
    createConnection
} from 'mysql2/promise';
import { WarehouseCatalog } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';


interface TableInfo {
    database: string;
    schema: string;
    table: string;
}

const queryTableSchema = ({
    database,
    schema,
    table,
}: TableInfo) => `SELECT table_catalog
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
    type: number | undefined,
): DimensionType => {
    switch (type) {
        case Types.BIT:
            return DimensionType.BOOLEAN;
        case Types.TINY:
        case Types.SHORT:
        case Types.FLOAT:
        case Types.NEWDECIMAL:
        case Types.DECIMAL:
        case Types.INT24:
        case Types.LONG:
        case Types.LONGLONG:
        case Types.DOUBLE:
            return DimensionType.NUMBER;
        case Types.DATE:
            return DimensionType.DATE;
        case Types.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case Types.TIME:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

const catalogToSchema = (results: string[][][]): WarehouseCatalog => {
    const warehouseCatalog: WarehouseCatalog = {};
    // Object.values(results).forEach((catalog) => {
    //     Object.values(catalog).forEach(
    //         ([
    //             table_catalog,
    //             table_schema,
    //             table_name,
    //             column_name,
    //             data_type,
    //         ]) => {
    //             warehouseCatalog[table_catalog] =
    //                 warehouseCatalog[table_catalog] || {};
    //             warehouseCatalog[table_catalog][table_schema] =
    //                 warehouseCatalog[table_catalog][table_schema] || {};
    //             warehouseCatalog[table_catalog][table_schema][table_name] =
    //                 warehouseCatalog[table_catalog][table_schema][table_name] ||
    //                 {};
    //             warehouseCatalog[table_catalog][table_schema][table_name][
    //                 column_name
    //             ] = convertDataTypeToDimensionType(data_type);
    //         },
    //     );
    // });
    return warehouseCatalog;
};

export class StarrocksWarehouseClient extends WarehouseBaseClient<CreateStarrocksCredentials> {
    connectionOptions: ConnectionOptions;

    constructor(credentials: CreateStarrocksCredentials) {
        super(credentials);
        this.connectionOptions = {
            user: credentials.user,
            password: credentials.password,
            database: credentials.schema,
            host: credentials.host,
            port: credentials.port,
        };
    }

    private async getSession() {
        let session: Connection;
        try {
            session = await createConnection(this.connectionOptions);
        } catch (e: any) {
            throw new WarehouseConnectionError(e.message);
        }

        return {
            session,
            close: async () => {
                console.info('Close starrocks connection');
            },
        };
    }

    private convertQueryResultFields(
        fields: FieldPacket[],
    ): Record<string, { type: DimensionType }> {
        fields.forEach((field) => {
            console.log('FIELD TYPE', field.type);
            console.log('FIELD TYPE', field.columnType);
            console.log('FIELD TYPE', field.typeName);
        })
        console.log(fields.reduce((agg, field) => ({
            ...agg,
            [field.name]: {
                type: convertDataTypeToDimensionType(field.columnType)
            }
        }), {}))
        return fields.reduce((agg, field) => ({
            ...agg,
            [field.name]: {
                type: convertDataTypeToDimensionType(field.columnType)
            }
        }), {});
    }


    async runQuery(sql: string, tags?: Record<string, string>) {
        const { session, close } = await this.getSession();
        let rows: RowDataPacket[]
        let fields: FieldPacket[];
        try {
            let alteredQuery = sql;
            if (tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(tags)}`;
            }
            [rows, fields] = await session.query<RowDataPacket[]>(sql);

            return {
                fields: this.convertQueryResultFields(fields),
                rows
            };
        } catch (e: any) {
            throw new WarehouseQueryError(e.message);
        } finally {
            await close();
        }
    }

    // TODO: Implement
    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const { session, close } = await this.getSession();
        let results: string[][][];
        // query = this.runQuery(queryTableSchema(requests[0]));
        console.log('REQUESTING CATALOG', requests);
        return catalogToSchema([]);
    }

    getFieldQuoteChar() {
        return '"';
    }

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return "'";
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.STARROCKS;
    }

    getMetricSql(sql: string, metric: Metric) {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_PERCENTILE(${sql}, ${(metric.percentile ?? 50) / 100
                    })`;
            case MetricType.MEDIAN:
                return `APPROX_PERCENTILE(${sql},0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }
}
