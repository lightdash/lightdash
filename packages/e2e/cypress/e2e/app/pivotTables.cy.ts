/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    CartesianSeriesType,
    ChartType,
    SEED_PROJECT,
    TableCalculationType,
} from '@lightdash/common';

type QueryResultRow = Record<
    string,
    { value?: { raw?: unknown; formatted?: string } }
>;

type ReadyQueryResults = {
    status: 'ready';
    columns?: Record<string, unknown>;
    rows: QueryResultRow[];
    pivotDetails?: {
        indexColumn?:
            | { reference: string }
            | Array<{ reference: string }>
            | undefined;
        valuesColumns?: Array<{ referenceField: string }>;
    } | null;
};

type PivotConfiguration = {
    indexColumn?:
        | { reference: string }
        | Array<{ reference: string }>
        | undefined;
    valuesColumns?: Array<{ reference: string }>;
    sortOnlyColumns?: Array<{ reference: string }>;
    sortBy?: Array<{ reference: string }>;
};

const buildExploreUrl = (chartState: Record<string, unknown>) =>
    `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=${encodeURIComponent(
        JSON.stringify(chartState),
    )}`;

const fieldReference = (fieldId: string) => `\${${fieldId}}`;

const getRequestBody = (body: any) =>
    typeof body === 'string' ? JSON.parse(body) : body;

const getReferences = (columns?: Array<{ reference: string }>) =>
    columns?.map((column) => column.reference) ?? [];

const getIndexReferences = (indexColumn: PivotConfiguration['indexColumn']) => {
    if (!indexColumn) return [];
    return Array.isArray(indexColumn)
        ? indexColumn.map((column) => column.reference)
        : [indexColumn.reference];
};

const getRawValues = (rows: QueryResultRow[], fieldId: string) =>
    rows
        .map((row) => row[fieldId]?.value?.raw)
        .filter((value) => value !== undefined && value !== null);

const getColumnIds = (results: ReadyQueryResults) => [
    ...Object.keys(results.columns ?? {}),
    ...results.rows.flatMap((row) => Object.keys(row)),
];

const unusedTableCalculationName = 'unused_revenue_label';

const waitForReadyPivotResults = (
    assertResults: (results: ReadyQueryResults) => void,
) => {
    cy.wait('@pivotQueryResults', { timeout: 60000 }).then((interception) => {
        const results = interception.response?.body?.results;

        if (results?.error) {
            throw new Error(`Query failed: ${results.error}`);
        }

        if (results?.status !== 'ready') {
            waitForReadyPivotResults(assertResults);
            return;
        }

        assertResults(results);
    });
};

const runPivotChart = (
    chartState: Record<string, unknown>,
    assertPivotConfiguration: (pivotConfiguration: PivotConfiguration) => void,
    assertResults: (results: ReadyQueryResults) => void,
) => {
    // Only alias requests that carry a pivotConfiguration. The
    // useSqlPivotResults feature flag resolves async, so an auto-fetch
    // can fire before the flag lands and produce a metric-query POST
    // without pivotConfiguration — which would race the Run-query click
    // and make cy.wait pick up the wrong request.
    cy.intercept('POST', '**/api/v2/projects/*/query/metric-query', (req) => {
        const body = getRequestBody(req.body);
        if (body?.pivotConfiguration !== undefined) {
            req.alias = 'runPivotQuery';
        }
    });
    cy.intercept('GET', '**/api/v2/projects/*/query/*').as('pivotQueryResults');

    cy.visit(buildExploreUrl(chartState));
    cy.get('button').contains('Run query').click();

    cy.wait('@runPivotQuery', { timeout: 60000 }).then((interception) => {
        const body = getRequestBody(interception.request.body);
        expect(body.pivotConfiguration).to.not.equal(undefined);
        assertPivotConfiguration(body.pivotConfiguration);
    });

    waitForReadyPivotResults(assertResults);

    cy.get('[data-testid="visualization"]').as('chartArea');
    cy.get('@chartArea').findByText('Loading chart').should('not.exist');
    cy.get('@chartArea')
        .find('.echarts-for-react canvas, .echarts-for-react svg')
        .should('exist');
};

const hiddenMetricSortChartState = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['customers_customer_id', 'orders_is_completed'],
        metrics: ['orders_total_order_amount', 'orders_unique_order_count'],
        filters: {},
        sorts: [{ fieldId: 'orders_total_order_amount', descending: true }],
        limit: 500,
        tableCalculations: [
            {
                name: unusedTableCalculationName,
                displayName: 'Unused revenue label',
                type: TableCalculationType.NUMBER,
                sql: fieldReference('orders.total_order_amount'),
            },
        ],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    tableConfig: {
        columnOrder: [
            'customers_customer_id',
            'orders_is_completed',
            'orders_total_order_amount',
            'orders_unique_order_count',
            unusedTableCalculationName,
        ],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customers_customer_id',
                yField: ['orders_unique_order_count'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customers_customer_id' },
                            yRef: { field: 'orders_unique_order_count' },
                        },
                    },
                ],
            },
        },
    },
};

const sortOnlyTableCalculationChartState = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['customers_customer_id', 'orders_is_completed'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [{ fieldId: 'revenue_rank', descending: false }],
        limit: 500,
        tableCalculations: [
            {
                name: 'revenue_rank',
                displayName: 'Revenue rank',
                type: TableCalculationType.NUMBER,
                sql: `rank() over (order by ${fieldReference(
                    'orders.total_order_amount',
                )} desc)`,
            },
        ],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    tableConfig: {
        columnOrder: [
            'customers_customer_id',
            'orders_is_completed',
            'orders_total_order_amount',
            'revenue_rank',
        ],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customers_customer_id',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customers_customer_id' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
};

const xAxisTableCalculationChartState = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [
            'customers_first_name',
            'customers_last_name',
            'orders_order_date_week',
        ],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [{ fieldId: 'customer_label', descending: false }],
        limit: 500,
        tableCalculations: [
            {
                name: 'customer_label',
                displayName: 'Customer label',
                type: TableCalculationType.STRING,
                sql: `concat(${fieldReference(
                    'customers.first_name',
                )}, ' ', ${fieldReference('customers.last_name')})`,
            },
        ],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_order_date_week'] },
    tableConfig: {
        columnOrder: [
            'customers_first_name',
            'customers_last_name',
            'orders_order_date_week',
            'orders_total_order_amount',
            'customer_label',
        ],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'customer_label',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'customer_label' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
};

const xAxisMetricChartState = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_is_completed'],
        metrics: ['orders_unique_order_count', 'orders_total_order_amount'],
        filters: {},
        sorts: [{ fieldId: 'orders_unique_order_count', descending: true }],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        metricOverrides: {},
    },
    pivotConfig: { columns: ['orders_is_completed'] },
    tableConfig: {
        columnOrder: [
            'orders_is_completed',
            'orders_unique_order_count',
            'orders_total_order_amount',
        ],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'orders_unique_order_count',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.SCATTER,
                        yAxisIndex: 0,
                        encode: {
                            xRef: { field: 'orders_unique_order_count' },
                            yRef: { field: 'orders_total_order_amount' },
                        },
                    },
                ],
            },
        },
    },
};

describe('Pivot Tables', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Can view shared pivot table from URL in explore', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // run query
        cy.get('button').contains('Run query').click();

        // Create a pivot table
        cy.contains('placed');
        cy.contains('shipped');

        cy.contains('False');
        cy.contains('2025-06-09');
        cy.contains('$1.00');
    });
    it('Can create a pivot table chart on explore', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // run query
        cy.get('button').contains('Run query').click();

        cy.contains('Tables').should('be.visible'); // Ensure the sidebar has loaded before clicking configure below
        cy.contains('Configure').click();
        cy.contains('Drag dimensions into this area to pivot your table');

        const dragSelector =
            '[role="tabpanel"] [data-rfd-drag-handle-draggable-id="orders_is_completed"]';
        const dropSelector = '[data-rfd-droppable-id="COLUMNS"]';

        cy.dragAndDrop(dragSelector, dropSelector);

        cy.get('[data-testid="visualization"]').as('chartArea'); // Using an alias aviod querying the DOM for the same element multiple times

        cy.get('@chartArea').findByText('Loading chart').should('not.exist');
        cy.get('@chartArea').contains('Is completed'); // Check that the chart updated successfully with the pivot table(containing 'is completed' column)
    });

    it('Can render a pivoted cartesian chart sorted by a metric that is not displayed', () => {
        runPivotChart(
            hiddenMetricSortChartState,
            (pivotConfiguration) => {
                expect(getReferences(pivotConfiguration.valuesColumns)).to.eql([
                    'orders_unique_order_count',
                ]);
                expect(
                    getIndexReferences(pivotConfiguration.indexColumn),
                ).not.to.include(unusedTableCalculationName);
                expect(
                    getReferences(pivotConfiguration.valuesColumns),
                ).not.to.include(unusedTableCalculationName);
                expect(
                    getReferences(pivotConfiguration.sortOnlyColumns),
                ).to.include('orders_total_order_amount');
                expect(
                    getReferences(pivotConfiguration.sortOnlyColumns),
                ).not.to.include(unusedTableCalculationName);
                expect(getReferences(pivotConfiguration.sortBy)).to.include(
                    'orders_total_order_amount',
                );
                expect(getReferences(pivotConfiguration.sortBy)).not.to.include(
                    unusedTableCalculationName,
                );
            },
            (results) => {
                expect(
                    getRawValues(results.rows, 'customers_customer_id').length,
                ).to.be.greaterThan(1);
                expect(
                    getColumnIds(results).some((columnId) =>
                        columnId.includes('orders_total_order_amount'),
                    ),
                ).to.equal(false);
            },
        );
    });

    it('Can render a pivoted cartesian chart sorted by a table calculation that is not displayed', () => {
        runPivotChart(
            sortOnlyTableCalculationChartState,
            (pivotConfiguration) => {
                expect(getReferences(pivotConfiguration.valuesColumns)).to.eql([
                    'orders_total_order_amount',
                ]);
                expect(
                    getReferences(pivotConfiguration.sortOnlyColumns),
                ).to.include('revenue_rank');
                expect(getReferences(pivotConfiguration.sortBy)).to.include(
                    'revenue_rank',
                );
            },
            (results) => {
                expect(
                    getRawValues(results.rows, 'customers_customer_id').length,
                ).to.be.greaterThan(1);
                expect(
                    results.pivotDetails?.valuesColumns?.map(
                        (column) => column.referenceField,
                    ) ?? [],
                ).not.to.include('revenue_rank');
            },
        );
    });

    it('Can render a pivoted cartesian chart with an x-axis table calculation sorted by itself', () => {
        runPivotChart(
            xAxisTableCalculationChartState,
            (pivotConfiguration) => {
                expect(
                    getIndexReferences(pivotConfiguration.indexColumn),
                ).to.include('customer_label');
                expect(
                    getReferences(pivotConfiguration.sortOnlyColumns),
                ).not.to.include('customer_label');
                expect(getReferences(pivotConfiguration.sortBy)).to.include(
                    'customer_label',
                );
            },
            (results) => {
                const customerLabels = getRawValues(
                    results.rows,
                    'customer_label',
                );

                expect(customerLabels.length).to.be.greaterThan(1);
                expect(new Set(customerLabels).size).to.be.greaterThan(1);
            },
        );
    });

    it('Can render a pivoted scatter chart with an x-axis metric sorted by itself', () => {
        runPivotChart(
            xAxisMetricChartState,
            (pivotConfiguration) => {
                expect(
                    getIndexReferences(pivotConfiguration.indexColumn),
                ).to.include('orders_unique_order_count');
                expect(
                    getReferences(pivotConfiguration.sortOnlyColumns),
                ).not.to.include('orders_unique_order_count');
                expect(getReferences(pivotConfiguration.sortBy)).to.include(
                    'orders_unique_order_count',
                );
            },
            (results) => {
                expect(
                    getRawValues(results.rows, 'orders_unique_order_count')
                        .length,
                ).to.be.greaterThan(0);
            },
        );
    });

    // todo: remove
    it.skip('I can save a pivot table chart and add it to a dashboard', () => {
        // Navigate to the explore page
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22%22%2C%22dimensions%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%5D%2C%22metrics%22%3A%5B%22orders_total_order_amount%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_order_date_week%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_order_date_week%22%2C%22orders_status%22%2C%22orders_is_completed%22%2C%22orders_total_order_amount%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showRowCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22showResultsTotal%22%3Afalse%2C%22showSubtotals%22%3Afalse%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%2C%22conditionalFormattings%22%3A%5B%5D%2C%22metricsAsRows%22%3Afalse%7D%7D%7D`,
        );

        // Save a pivot table
        cy.contains('Save chart').click();
        cy.get('[data-testid="ChartCreateModal/NameInput"]').type(
            'My Pivot Table Chart',
        );
        cy.findByText('Next').click();
        cy.findByText('Save').click();
        cy.contains('Chart was saved');
        cy.contains('My Pivot Table Chart');

        // Add pivot table to a new dashboard
        cy.get('button:has(.tabler-icon-dots)').click();
        cy.contains('Add to dashboard').click();

        cy.contains('Add chart to dashboard');
        cy.contains('Create new dashboard').click();
        cy.get('#dashboard-name').type('My Pivot Table Dashboard');
        cy.get('button[type="submit"]').click({ force: true }); // Create dashboard
        cy.contains('Open dashboard').click();

        // Wait until dashboard is loaded
        cy.contains('Date Zoom');
        cy.contains('My Pivot Table Chart');
        cy.contains('placed');
        cy.contains('shipped');
        cy.contains('False');
        cy.contains('2025-06-09');
        cy.contains('$1.00');
    });
});

// todo: move to unit test
describe.skip('100% stacked bar chart', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Can create a 100% stacked bar chart with correct percentage labels', () => {
        // Load directly a chart with parameters to build a 100% bar chat with labels
        const chartConfig = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22exploreName%22%3A%22orders%22%2C%22dimensions%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%5D%2C%22metrics%22%3A%5B%22orders_unique_order_count%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22orders_status%22%2C%22descending%22%3Afalse%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%2C%22metricOverrides%22%3A%7B%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_status%22%2C%22orders_order_date_month%22%2C%22orders_unique_order_count%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_order_date_month%22%2C%22yField%22%3A%5B%22orders_unique_order_count%22%5D%2C%22stack%22%3A%22stack100%22%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22completed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22placed%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22returned%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22return_pending%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%2C%7B%22type%22%3A%22bar%22%2C%22yAxisIndex%22%3A0%2C%22label%22%3A%7B%22show%22%3Atrue%2C%22position%22%3A%22inside%22%7D%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_order_date_month%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_unique_order_count%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22orders_status%22%2C%22value%22%3A%22shipped%22%7D%5D%7D%7D%2C%22stack%22%3A%22orders_unique_order_count%22%2C%22isFilteredOut%22%3Afalse%7D%5D%7D%7D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22orders_status%22%5D%7D%7D&isExploreFromHere=true`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${chartConfig}`,
        );
        cy.findByTestId('page-spinner').should('not.exist');

        // These data should remain constant for the same data in orders table
        // Check labels on the chart are showing % values
        cy.get('svg').contains('100.0%').should('exist');
        cy.get('svg').contains('88.9%').should('exist');
        cy.get('svg').contains('22.2%').should('exist');
        cy.get('svg').contains('0.0%').should('exist');
    });
});
