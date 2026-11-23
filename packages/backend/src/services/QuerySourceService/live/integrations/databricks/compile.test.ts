import {
    ApiConnectorType,
    FilterOperator,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { databricksIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileDatabricksQuery } from './compile';
import {
    DATABRICKS_BILLING_USAGE_EXPLORE,
    DATABRICKS_EXPLORES,
    DATABRICKS_JOB_RUNS_EXPLORE,
    DATABRICKS_TABLES_EXPLORE,
} from './explores';
import { parseDatabricksQuery } from './run';
import { DATABRICKS_SQL_BUILDER } from './sql';

const buildExplore = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `databricks_${definition.name}`,
        label: 'Databricks',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.DATABRICKS,
        baseVersion: 1,
        capabilities: databricksIntegration.capabilities,
        warehouseSqlBuilder: DATABRICKS_SQL_BUILDER,
    });

const fieldOf = (definition: LiveExploreDefinition) => (name: string) =>
    `databricks_${definition.name}_${name}`;

const query = (
    definition: LiveExploreDefinition,
    overrides: Partial<MetricQuery>,
): MetricQuery => ({
    exploreName: `databricks_${definition.name}`,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const compile = (definition: LiveExploreDefinition, metricQuery: MetricQuery) =>
    compileDatabricksQuery({
        explore: buildExplore(definition),
        metricQuery,
    });

describe('compileDatabricksQuery', () => {
    const billing = fieldOf(DATABRICKS_BILLING_USAGE_EXPLORE);

    it('reads the system table through a CTE named after the explore', () => {
        const { query: sql, fieldIdsByColumn } = compile(
            DATABRICKS_BILLING_USAGE_EXPLORE,
            query(DATABRICKS_BILLING_USAGE_EXPLORE, {
                dimensions: [billing('usage_month'), billing('sku_name')],
                metrics: [billing('list_cost')],
                sorts: [{ fieldId: billing('list_cost'), descending: true }],
            }),
        );
        expect(
            sql.startsWith('WITH `billing_usage` AS (\nSELECT usage.*'),
        ).toBe(true);
        expect(sql).toContain('FROM system.billing.usage AS usage');
        expect(sql).toContain('LEFT JOIN system.billing.list_prices');
        expect(sql).toContain("DATE_TRUNC('MONTH'");
        expect(sql).toContain('ORDER BY c2 DESC');
        expect(fieldIdsByColumn).toEqual({
            c0: billing('usage_month'),
            c1: billing('sku_name'),
            c2: billing('list_cost'),
        });
        expect(sql).toContain(
            'FROM `billing_usage` AS `databricks_billing_usage`',
        );
    });

    it('reads the last 30 days without a date filter', () => {
        const { query: sql } = compile(
            DATABRICKS_BILLING_USAGE_EXPLORE,
            query(DATABRICKS_BILLING_USAGE_EXPLORE, {
                metrics: [billing('usage_quantity')],
            }),
        );
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        expect(sql).toContain(
            `(CAST(\`databricks_billing_usage\`.usage_date AS DATE)) >= ('${from}')`,
        );
    });

    it('counts a filter on the month as a date filter', () => {
        const monthRule: FilterRule = {
            id: 'month',
            target: { fieldId: billing('usage_month') },
            operator: FilterOperator.IN_THE_PAST,
            values: [6],
            settings: { unitOfTime: 'months', completed: false },
        };
        const { query: sql } = compile(
            DATABRICKS_BILLING_USAGE_EXPLORE,
            query(DATABRICKS_BILLING_USAGE_EXPLORE, {
                metrics: [billing('usage_quantity')],
                filters: { dimensions: { id: 'root', and: [monthRule] } },
            }),
        );
        expect(sql).not.toContain(
            'CAST(`databricks_billing_usage`.usage_date AS DATE)) >=',
        );
    });

    it('keeps a date filter the query has', () => {
        const dateRule: FilterRule = {
            id: 'date',
            target: { fieldId: billing('usage_date') },
            operator: FilterOperator.IN_BETWEEN,
            values: ['2026-10-01', '2026-10-31'],
        };
        const { query: sql } = compile(
            DATABRICKS_BILLING_USAGE_EXPLORE,
            query(DATABRICKS_BILLING_USAGE_EXPLORE, {
                metrics: [billing('usage_quantity')],
                filters: { dimensions: { id: 'root', and: [dateRule] } },
            }),
        );
        expect(sql).toContain('2026-10-01');
        expect(sql).not.toContain('live-data-source-default-date-range');
    });

    it('counts failed job runs once each', () => {
        const runs = fieldOf(DATABRICKS_JOB_RUNS_EXPLORE);
        const { query: sql } = compile(
            DATABRICKS_JOB_RUNS_EXPLORE,
            query(DATABRICKS_JOB_RUNS_EXPLORE, {
                dimensions: [runs('job_id')],
                metrics: [runs('run_count'), runs('failed_runs')],
            }),
        );
        expect(sql).toContain('FROM system.lakeflow.job_run_timeline');
        expect(sql).toMatch(/COUNT\(DISTINCT CASE WHEN/);
    });

    it('reads tables with no date range', () => {
        const tables = fieldOf(DATABRICKS_TABLES_EXPLORE);
        const { query: sql } = compile(
            DATABRICKS_TABLES_EXPLORE,
            query(DATABRICKS_TABLES_EXPLORE, {
                dimensions: [tables('table_catalog')],
                metrics: [tables('table_count')],
            }),
        );
        expect(sql).toContain('FROM system.information_schema.tables');
        expect(sql).not.toContain('INTERVAL');
    });

    it.each(DATABRICKS_EXPLORES)(
        'compiles every field of $name into a statement it accepts',
        (definition) => {
            const field = fieldOf(definition);
            const { query: sql } = compile(
                definition,
                query(definition, {
                    dimensions: definition.dimensions.map(({ name }) =>
                        field(name),
                    ),
                    metrics: definition.metrics.map(({ name }) => field(name)),
                }),
            );
            expect(parseDatabricksQuery(sql)).toBe(sql);
        },
    );

    it('adds the limit through compileLiveMetricQuery', () => {
        const compiled = compileLiveMetricQuery({
            explore: buildExplore(DATABRICKS_BILLING_USAGE_EXPLORE),
            metricQuery: query(DATABRICKS_BILLING_USAGE_EXPLORE, {
                dimensions: [billing('workspace_id')],
                metrics: [billing('usage_quantity')],
                limit: 25,
            }),
            timezone: 'UTC',
            now: new Date('2026-11-04T12:00:00Z'),
        });
        expect(compiled).toMatchObject({ limit: 25 });
    });
});

describe('parseDatabricksQuery', () => {
    it('takes one read-only statement', () => {
        expect(parseDatabricksQuery(' SELECT 1;  ')).toBe('SELECT 1');
        expect(
            parseDatabricksQuery(
                "WITH t AS (SELECT * FROM system.access.audit WHERE action_name = 'deleteTable') SELECT count(*) AS n FROM t",
            ),
        ).toContain('deleteTable');
        expect(
            parseDatabricksQuery(
                "SELECT 'drop table x' AS note, created FROM system.information_schema.tables",
            ),
        ).toContain('drop table');
        expect(
            parseDatabricksQuery(
                "SELECT 'it''s; -- not a comment' AS a, `delete` FROM t -- a 'comment'",
            ),
        ).toContain('not a comment');
    });

    it.each([
        '',
        'DROP TABLE main.default.orders',
        'WITH t AS (SELECT 1) INSERT INTO main.default.orders SELECT * FROM t',
        'SELECT 1; DROP TABLE main.default.orders',
        'GRANT SELECT ON TABLE main.default.orders TO `everyone`',
        'SET spark.sql.ansi.enabled = false',
        "WITH x AS (SELECT 1 -- '\n) INSERT INTO t SELECT * FROM x -- '",
        "SELECT 1 /* ' */ ; DROP TABLE t",
        "SELECT 'it\\'s' AS a; DROP TABLE t",
    ])('refuses %j', (sql) => {
        expect(() => parseDatabricksQuery(sql)).toThrow();
    });
});
