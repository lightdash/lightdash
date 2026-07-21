import {
    DimensionType,
    FieldType,
    InlineErrorType,
    MetricType,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { validateWarehouseColumnReferences } from './validateWarehouseColumnReferences';

const explore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: '"postgres"."jaffle"."orders"',
            lineageGraph: {},
            dimensions: {
                amount: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'amount',
                    label: 'Amount',
                    table: 'orders',
                    tableLabel: 'Orders',
                    // eslint-disable-next-line no-template-curly-in-string
                    sql: '${TABLE}.amount',
                    compiledSql: '"orders".amount',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                stale_metric: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.AVERAGE,
                    name: 'stale_metric',
                    label: 'Stale metric',
                    table: 'orders',
                    tableLabel: 'Orders',
                    // eslint-disable-next-line no-template-curly-in-string
                    sql: '${TABLE}.rolling_30d_avg_sales',
                    compiledSql: 'AVG("orders".rolling_30d_avg_sales)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
        },
    },
};

const queryResult = { fields: {}, rows: [] };
const tags = { query_context: 'cli' };

describe('validateWarehouseColumnReferences', () => {
    it('returns explores unchanged when the warehouse accepts all references', async () => {
        const runQuery = vi.fn(async () => queryResult);

        const result = await validateWarehouseColumnReferences({
            explores: [explore],
            client: { getFieldQuoteChar: () => '"', runQuery },
            tags,
        });

        expect(result).toEqual([explore]);
        expect(runQuery).toHaveBeenCalledTimes(1);
        expect(runQuery).toHaveBeenNthCalledWith(
            1,
            'SELECT "orders".amount, "orders".rolling_30d_avg_sales FROM "postgres"."jaffle"."orders" AS "orders" WHERE 1 = 0',
            tags,
        );
    });

    it('attaches one warning for each reference rejected by the warehouse', async () => {
        const runQuery = vi.fn(async (sql: string) => {
            if (sql.includes('rolling_30d_avg_sales')) {
                throw new Error(
                    'column orders.rolling_30d_avg_sales does not exist',
                );
            }
            return queryResult;
        });

        const [result] = await validateWarehouseColumnReferences({
            explores: [explore],
            client: { getFieldQuoteChar: () => '"', runQuery },
            tags,
        });

        expect(result).toEqual({
            ...explore,
            warnings: [
                {
                    type: InlineErrorType.WAREHOUSE_COLUMN_ERROR,
                    message:
                        // eslint-disable-next-line no-template-curly-in-string
                        'Warehouse rejected column reference ${TABLE}.rolling_30d_avg_sales in model "orders": column orders.rolling_30d_avg_sales does not exist',
                },
            ],
        });
        expect(runQuery).toHaveBeenCalledTimes(5);
    });

    it('skips column validation when the relation probe fails', async () => {
        const runQuery = vi.fn(async () => {
            throw new Error('warehouse unavailable');
        });

        const result = await validateWarehouseColumnReferences({
            explores: [explore],
            client: { getFieldQuoteChar: () => '"', runQuery },
            tags,
        });

        expect(result).toEqual([explore]);
        expect(runQuery).toHaveBeenCalledTimes(2);
    });
});
