import {
    CreateAthenaCredentials,
    DimensionType,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    WarehouseQueryError,
} from '@lightdash/common';

import {
    AthenaClient,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    QueryExecutionState,
    ResultSet,
    StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { WarehouseCatalog } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';

export enum AthenaTypes {
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
            WHERE table_catalog = lower('${database}')
                AND table_schema = lower('${schema}')
                AND table_name = lower('${table}')
            ORDER BY 1, 2, 3, ordinal_position`;

const convertDataTypeToDimensionType = (
    type: AthenaTypes | string,
): DimensionType => {
    const typeWithoutTimePrecision = type.replace(/\(\d\)/, '');
    switch (typeWithoutTimePrecision) {
        case AthenaTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case AthenaTypes.TINYINT:
            return DimensionType.NUMBER;
        case AthenaTypes.SMALLINT:
            return DimensionType.NUMBER;
        case AthenaTypes.INTEGER:
            return DimensionType.NUMBER;
        case AthenaTypes.BIGINT:
            return DimensionType.NUMBER;
        case AthenaTypes.REAL:
            return DimensionType.NUMBER;
        case AthenaTypes.DOUBLE:
            return DimensionType.NUMBER;
        case AthenaTypes.DECIMAL:
            return DimensionType.NUMBER;
        case AthenaTypes.DATE:
            return DimensionType.DATE;
        case AthenaTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case AthenaTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

export class AthenaWarehouseClient extends WarehouseBaseClient<CreateAthenaCredentials> {
    connectionOptions: Pick<
        CreateAthenaCredentials,
        'outputLocation' | 'workgroup' | 'extraBotoArgs' | 'database'
    >;

    client: AthenaClient;

    constructor(credentials: CreateAthenaCredentials) {
        super(credentials);
        const credObj: { credentials?: any } = {};
        if (credentials.awsAccessKeyId && credentials.awsSecretKey) {
            credObj.credentials = {
                accessKeyId: credentials.awsAccessKeyId,
                secretAccessKey: credentials.awsSecretKey,
            };
        }

        this.client = new AthenaClient({
            region: credentials.awsRegion,
            ...credObj,
        });

        this.connectionOptions = {
            outputLocation: credentials.outputLocation,
            workgroup: credentials.workgroup,
            database: credentials.database,
            extraBotoArgs: credentials.extraBotoArgs,
        };
    }

    private async checkQueryExequtionStateAndGetData(
        QueryExecutionId: string,
    ): Promise<any> {
        const command = new GetQueryExecutionCommand({ QueryExecutionId });
        const response = await this.client.send(command);

        const state = response.QueryExecution?.Status?.State;

        if (
            state === QueryExecutionState.QUEUED ||
            state === QueryExecutionState.RUNNING
        ) {
            // In my case, queries run no faster than 800-900ms, which is why I set a 1000ms timeout
            await new Promise<void>((res) => {
                setTimeout(() => res(), 1000);
            });
            return this.checkQueryExequtionStateAndGetData(QueryExecutionId);
        }
        if (state === QueryExecutionState.SUCCEEDED) {
            return this.getQueryResults(QueryExecutionId);
        }
        if (state === QueryExecutionState.FAILED) {
            throw new WarehouseQueryError(
                `Query failed: ${response.QueryExecution?.Status?.StateChangeReason}`,
            );
        } else if (state === QueryExecutionState.CANCELLED) {
            throw new WarehouseQueryError('Query was cancelled');
        }

        throw new WarehouseQueryError('Query state not determined');
    }

    /**
     * Get result of query exeqution
     * @param {String} QueryExecutionId Id of a query which we sent to Athena
     * @return {Array} Array of Objects
     */
    private async getQueryResults(QueryExecutionId: string) {
        const getQueryResultsCommand = new GetQueryResultsCommand({
            QueryExecutionId,
        });
        const response = await this.client.send(getQueryResultsCommand);

        return this.mapData(response.ResultSet);
    }

    /**
     * The function map data returned from Athena as rows of values in the array of key/value objects.
     * @param {Array} data Data of rows returned from Athena
     * @return {Array} Array of Objects
     */
    private mapData(data: ResultSet | undefined): { fields: {}; rows: any[] } {
        if (!data) {
            return { fields: {}, rows: [] };
        }

        const fields =
            data.ResultSetMetadata?.ColumnInfo?.reduce(
                (acc, column) => ({
                    ...acc,
                    [column.Name || '']: convertDataTypeToDimensionType(
                        column.Type || AthenaTypes.VARCHAR,
                    ),
                }),
                {},
            ) || {};

        const rows =
            data.Rows?.slice(1).map((r) =>
                r.Data?.reduce((acc, column, i) => {
                    const name =
                        data.ResultSetMetadata?.ColumnInfo?.[i].Name || '';
                    return {
                        ...acc,
                        [name]: column.VarCharValue,
                    };
                }, {}),
            ) || [];

        return { fields, rows };
    }

    async runQuery(
        sql: string,
        tags?: Record<string, string>,
        timezone?: string,
    ): Promise<{ fields: {}; rows: any[] }> {
        const queryExecutionInput = {
            QueryString: sql,
            QueryExecutionContext: {
                Database: this.connectionOptions.database,
            },
            ResultConfiguration: {
                OutputLocation: this.connectionOptions.outputLocation,
            },

            WorkGroup: this.connectionOptions.workgroup || 'primary',
            ...JSON.parse(this.connectionOptions.extraBotoArgs ?? '{}'),
        };

        try {
            const { QueryExecutionId } = await this.client.send(
                new StartQueryExecutionCommand(queryExecutionInput),
            );
            if (QueryExecutionId) {
                const response = await this.checkQueryExequtionStateAndGetData(
                    QueryExecutionId,
                );

                return response;
            }
            throw new WarehouseQueryError(
                'StartQueryExecutionCommand failed to return QueryExecutionId',
            );
        } catch (error) {
            throw new WarehouseQueryError(error);
        }
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const warehouseCatalog: WarehouseCatalog = {};

        await Promise.all(
            requests.map(async (request) => {
                try {
                    const { rows } = await this.runQuery(
                        queryTableSchema(request),
                    );
                    rows.forEach((row) => {
                        const tableCatalog = request.database;

                        if (!warehouseCatalog[tableCatalog]) {
                            warehouseCatalog[tableCatalog] = {};
                        }
                        if (!warehouseCatalog[tableCatalog][row.table_schema]) {
                            warehouseCatalog[tableCatalog][row.table_schema] =
                                {};
                        }

                        if (
                            !warehouseCatalog[tableCatalog][row.table_schema][
                                row.table_name
                            ]
                        ) {
                            warehouseCatalog[tableCatalog][row.table_schema][
                                row.table_name
                            ] = {};
                        }

                        warehouseCatalog[tableCatalog][row.table_schema][
                            row.table_name
                        ][row.column_name] = convertDataTypeToDimensionType(
                            row.data_type,
                        );
                    });
                } catch (e: any) {
                    throw new WarehouseQueryError(e.message);
                }
            }),
        );

        return warehouseCatalog;
    }

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return "'";
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.ATHENA;
    }

    getMetricSql(sql: string, metric: Metric) {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_PERCENTILE(${sql}, ${
                    (metric.percentile ?? 50) / 100
                })`;
            case MetricType.MEDIAN:
                return `APPROX_PERCENTILE(${sql},0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }
}
