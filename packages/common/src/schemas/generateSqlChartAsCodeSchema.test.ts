import Ajv from 'ajv';
import fs from 'node:fs';
import { getSwaggerPath } from './generateChartAsCodeSchema';
import { buildSqlChartAsCodeSchema } from './generateSqlChartAsCodeSchema';
import sqlChartAsCodeSchema from './json/sql-chart-as-code-1.0.json';

const validSqlChart = {
    name: 'Orders by status',
    description: null,
    slug: 'orders-by-status',
    spaceSlug: 'sales',
    sql: 'select status, count(*) as orders from orders group by 1',
    limit: 500,
    chartKind: 'vertical_bar',
    version: 1,
    config: {
        metadata: { version: 1 },
        type: 'vertical_bar',
        fieldConfig: {
            x: { reference: 'status', type: 'category' },
            y: [{ reference: 'orders', aggregation: 'sum' }],
            groupBy: [],
        },
        display: {},
    },
};

describe('generateSqlChartAsCodeSchema', () => {
    const ajv = new Ajv({
        strict: false,
        validateFormats: false,
        allErrors: true,
    });
    const validate = ajv.compile(sqlChartAsCodeSchema);

    test('committed schema matches the swagger SqlChartAsCode component', () => {
        const swagger = JSON.parse(fs.readFileSync(getSwaggerPath(), 'utf8'));
        expect(
            JSON.parse(JSON.stringify(buildSqlChartAsCodeSchema(swagger))),
        ).toEqual(sqlChartAsCodeSchema);
    });

    test('accepts a SQL chart body', () => {
        expect(validate(validSqlChart)).toBe(true);
    });

    test('rejects a body without sql and with unknown properties', () => {
        const { sql, ...withoutSql } = validSqlChart;
        expect(validate({ ...withoutSql, tableName: 'orders' })).toBe(false);
        expect(validate.errors?.map((error) => error.keyword)).toEqual(
            expect.arrayContaining(['required', 'additionalProperties']),
        );
    });
});
