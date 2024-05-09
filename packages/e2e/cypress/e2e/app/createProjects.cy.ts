import {
    CustomDimensionType,
    ResultRow,
    SEED_PROJECT,
} from '@lightdash/common';

const warehouseConfig = {
    postgresSQL: {
        name: 'Jaffle PostgreSQL test',
        host: Cypress.env('PGHOST') || 'db-dev',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    redshift: {
        name: 'Jaffle Redshift test',
        host: Cypress.env('PGHOST') || 'db-dev',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    bigQuery: {
        name: 'Jaffle Bigquery test',
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyFile: 'credentials.json',
    },
    databricks: {
        name: 'Jaffle Databricks test',
        host: Cypress.env('DATABRICKS_HOST'),
        token: Cypress.env('DATABRICKS_TOKEN'),
        httpPath: Cypress.env('DATABRICKS_PATH'),
        schema: 'jaffle',
    },
    snowflake: {
        name: 'Jaffle Snowflake test',
        account: Cypress.env('SNOWFLAKE_ACCOUNT'),
        user: Cypress.env('SNOWFLAKE_USER'),
        password: Cypress.env('SNOWFLAKE_PASSWORD'),
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
    },
    trino: {
        name: 'Jaffle Trino test',
        host: Cypress.env('TRINO_HOST'),
        port: Cypress.env('TRINO_PORT'),
        user: Cypress.env('TRINO_USER'),
        password: Cypress.env('TRINO_PASSWORD'),
        database: 'e2e_jaffle_shop',
        schema: 'e2e_jaffle_shop',
    },
};

const configurePostgresWarehouse = (
    config: typeof warehouseConfig['postgresSQL'],
) => {
    cy.get('input[name="warehouse.host"]').type(config.host, { log: false });
    cy.get('input[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('input[name="warehouse.password"]').type(config.password, {
        log: false,
    });
    cy.get('input[name="warehouse.dbname"]').type(config.database);

    cy.contains('button', 'Advanced configuration options').click();

    cy.get('input[name="warehouse.port"]').clear().type(config.port);
    cy.selectMantine('warehouse.sslmode', 'disable');

    // DBT
    cy.selectMantine('dbt.type', 'dbt local server');
    cy.get('input[name="dbt.target"]').type('test');
    cy.get('input[name="warehouse.schema"]').type(config.schema);
};

const configureBigqueryWarehouse = (
    config: typeof warehouseConfig['bigQuery'],
) => {
    cy.get('input[name="warehouse.project"]').type(config.project, {
        log: false,
    });
    cy.get('input[name="warehouse.location"]').type(config.location, {
        log: false,
    });
    cy.get('[type="file"]').attachFile(warehouseConfig.bigQuery.keyFile);

    // DBT
    cy.selectMantine('dbt.type', 'dbt local server');
    cy.get('input[name="dbt.target"]').type('test');
    cy.get('input[name="warehouse.dataset"]').type(config.dataset);
};
const configureTrinoWarehouse = (config: typeof warehouseConfig['trino']) => {
    cy.get('input[name="warehouse.host"]').type(config.host, { log: false });
    cy.get('input[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('input[name="warehouse.password"]').type(config.password, {
        log: false,
    });
    cy.get('input[name="warehouse.dbname"]').type(config.database);

    cy.contains('a', 'Advanced configuration options').click();

    cy.get('input[name="warehouse.port"]').clear().type(config.port);
    cy.get('select[name="warehouse.http_scheme"]').select('https');

    // DBT
    cy.selectMantine('dbt.type', 'dbt local server');
    cy.get('input[name="dbt.target"]').type('test');
    cy.get('input[name="warehouse.schema"]').type(config.schema);
};

const configureDatabricksWarehouse = (
    config: typeof warehouseConfig['databricks'],
) => {
    cy.get('input[name="warehouse.serverHostName"]').type(config.host, {
        log: false,
    });
    cy.get('input[name="warehouse.httpPath"]').type(config.httpPath, {
        log: false,
    });
    cy.get('input[name="warehouse.personalAccessToken"]').type(config.token, {
        log: false,
    });

    // DBT
    cy.selectMantine('dbt.type', 'dbt local server');
    cy.get('input[name="dbt.target"]').type('test');
    cy.get('input[name="warehouse.database"]').type(config.schema);
};

const configureSnowflakeWarehouse = (
    config: typeof warehouseConfig['snowflake'],
) => {
    cy.get('input[name="warehouse.account"]').type(config.account, {
        log: false,
    });
    cy.get('input[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('input[name="warehouse.password"]').type(config.password, {
        log: false,
    });
    cy.get('input[name="warehouse.role"]').type(config.role);
    cy.get('input[name="warehouse.database"]').type(config.database);
    cy.get('input[name="warehouse.warehouse"]').type(config.warehouse);

    // DBT
    cy.selectMantine('dbt.type', 'dbt local server');
    cy.get('input[name="dbt.target"]').type('test');
    cy.get('input[name="warehouse.schema"]').type(config.schema);
};

const testCompile = (): Cypress.Chainable<string> => {
    // Compile
    cy.findByText('Test & compile project').click();
    cy.contains('Step 1/3', { timeout: 60000 });
    cy.contains('Step 2/3', { timeout: 60000 });
    cy.contains('Successfully synced dbt project!', { timeout: 60000 });

    cy.contains('selected 11 models');
    // Configure
    cy.contains('button', 'Save changes').click();
    cy.url().should('include', '/home', { timeout: 30000 });
    cy.contains('Welcome, David');
    cy.findByText('Charts and Dashboards');
    cy.findByText('get started by creating some charts');
    cy.wait(1000);
    return cy.url().then(
        (url) =>
            // get new project uuid
            url.split('/')[4],
    );
};

const testFilterStringEscaping = (projectUuid: string) => {
    cy.request({
        url: `api/v1/projects/${projectUuid}/explores/customers/runQuery`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            exploreName: 'customers',
            dimensions: ['customers_first_name'],
            metrics: [],
            filters: {
                dimensions: {
                    id: '7c015e80-7407-431f-b4bf-d3f5bd74ffc7',
                    and: [
                        {
                            id: 'e0c85f24-69c0-4a34-bc2a-f598eb7e26c9',
                            target: { fieldId: 'customers_first_name' },
                            operator: 'equals',
                            values: ["Quo'te"],
                        },
                    ],
                },
            },
            sorts: [{ fieldId: 'customers_first_name', descending: false }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body.results.rows[0].customers_first_name.value.raw).to.eq(
            "Quo'te",
        );
    });
};

const defaultRowValues = [
    '2020-08-11, 23:44:00:000 (+00:00)',
    '2020-08-11, 23:44:00:000 (+00:00)',
    '2020-08-11, 23:44:00 (+00:00)',
    '2020-08-11, 23:44 (+00:00)',
    '2020-08-11, 23 (+00:00)',
    '2020-08-11',
    '2',
    'Tuesday',
    '11',
    '224',
    '2020-08-10',
    '33',
    '2020-08',
    '8',
    'August',
    '2020-Q3',
    '3',
    'Q3',
    '2020',
    '2020',
    '23',
    '44',
];

const percentileRowValues = ['2020-08-11', '1,298', '828', '1,298', '1,717'];

const testPercentile = (
    projectUuid: string,
    rowValues = percentileRowValues,
) => {
    cy.request({
        url: `api/v1/projects/${projectUuid}/explores/events/runQuery`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            exploreName: 'events',
            dimensions: ['events_timestamp_tz_day'],
            metrics: [
                'events_median',
                'events_percentile_25',
                'events_percentile_50',
                'events_percentile_75',
            ],
            filters: {},
            sorts: [{ fieldId: 'events_timestamp_tz_day', descending: true }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        // check first row values
        rowValues.forEach((value, index) => {
            expect(
                Object.values(resp.body.results.rows[0] as ResultRow)[index]
                    .value.formatted,
            ).to.eq(value);
        });
    });
};

const testTimeIntervalsResults = (
    projectUuid: string,
    rowValues = defaultRowValues,
) => {
    cy.request({
        url: `api/v1/projects/${projectUuid}/explores/events/runQuery`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            exploreName: 'events',
            dimensions: [
                'events_timestamp_tz_raw',
                'events_timestamp_tz_millisecond',
                'events_timestamp_tz_second',
                'events_timestamp_tz_minute',
                'events_timestamp_tz_hour',
                'events_timestamp_tz_day',
                'events_timestamp_tz_day_of_week_index',
                'events_timestamp_tz_day_of_week_name',
                'events_timestamp_tz_day_of_month_num',
                'events_timestamp_tz_day_of_year_num',
                'events_timestamp_tz_week',
                'events_timestamp_tz_week_num',
                'events_timestamp_tz_month',
                'events_timestamp_tz_month_num',
                'events_timestamp_tz_month_name',
                'events_timestamp_tz_quarter',
                'events_timestamp_tz_quarter_num',
                'events_timestamp_tz_quarter_name',
                'events_timestamp_tz_year',
                'events_timestamp_tz_year_num',
                'events_timestamp_tz_hour_of_day_num',
                'events_timestamp_tz_minute_of_hour_num',
            ],
            metrics: [],
            filters: {},
            sorts: [{ fieldId: 'events_timestamp_tz_raw', descending: true }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        // check first row values
        rowValues.forEach((value, index) => {
            expect(
                Object.values(resp.body.results.rows[0] as ResultRow)[
                    index
                ].value.formatted.trim(),
            ).to.eq(value);
        });
    });
};

const apiUrl = '/api/v1';

const createCustomDimensionChart = (projectUuid) => {
    // This is used by create project to quickly create a custom dimension chart
    // because we don't have charts on new projects created by the e2e tests

    // This metric query is the same in `02_saved_queries`
    cy.request({
        url: `${apiUrl}/projects/${projectUuid}/saved`,
        method: 'POST',
        body: {
            name: 'How do payment methods vary across different amount ranges?"',
            description: 'Payment range by amount',
            tableName: 'payments',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['payments_payment_method'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_total_order_amount', descending: true },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [
                    {
                        id: 'amount_range',
                        name: 'amount range',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'payments_amount',
                        binType: 'fixed_number',
                        binNumber: 5,
                        table: 'payments',
                    },
                ],
            },
            chartConfig: {
                type: 'cartesian',
                config: {
                    layout: {
                        flipAxes: false,
                        xField: 'amount_range',
                        yField: ['orders_total_order_amount'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                encode: {
                                    xRef: { field: 'amount_range' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                type: 'bar',
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'amount_range',
                    'orders_total_order_amount',
                    'payments_payment_method',
                ],
            },
            pivotConfig: {
                columns: ['payments_payment_method'],
            },
        },
    }).then((r) => {
        expect(r.status).to.eq(200);
    });
};

const testCustomDimensions = (projectUuid) => {
    // Test custom dimension by going into an existing chart with custom dimensions and running the query
    // This is also used in createProject.cy.ts to test custom dimensions against all warehouses
    cy.visit(`/projects/${projectUuid}/saved`);
    cy.contains('How do payment methods vary').click();
    cy.contains('0 - 6');
    cy.contains('6 - 12');
};

describe('Create projects', () => {
    before(() => {
        cy.login();
        // clean previous e2e projects
        const projectNames = Object.values(warehouseConfig).map<string>(
            ({ name }) => name,
        );
        cy.deleteProjectsByName(projectNames);
    });

    beforeEach(() => {
        cy.login();
    });

    it.skip('I can create a custom dimension chart from api', () => {
        // you can enable this if you want to test this directly
        createCustomDimensionChart(SEED_PROJECT.project_uuid);
    });
    it.skip('I can view an existing custom dimension chart', () => {
        // you can enable this if you want to test this directly
        testCustomDimensions(SEED_PROJECT.project_uuid);
    });
    it.skip('Should be able to create new project from settings', () => {
        cy.visit(`/`);

        cy.findAllByTestId('settings-menu').click();
        cy.findByRole('menuitem', { name: 'Organization settings' }).click();

        cy.findByText('Projects').click();
        cy.findByText('Create new').click();
        cy.get('[role="button"').contains('PostgreSQL').click();

        cy.url().should('include', '/createProject/cli');

        cy.get('[role="button"').contains('Manually').click();
    });

    it('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('PostgreSQL').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.postgresSQL.name);
        configurePostgresWarehouse(warehouseConfig.postgresSQL);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);
            testTimeIntervalsResults(projectUuid);
            testPercentile(projectUuid);

            createCustomDimensionChart(projectUuid);
            testCustomDimensions(projectUuid);
        });
    });
    it('Should create a Redshift project', () => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('Redshift').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.redshift.name);
        configurePostgresWarehouse(warehouseConfig.redshift);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);
            testTimeIntervalsResults(projectUuid);
            testPercentile(projectUuid);

            createCustomDimensionChart(projectUuid);
            testCustomDimensions(projectUuid);
        });
    });
    it('Should create a Bigquery project', () => {
        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('BigQuery').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.bigQuery.name);
        configureBigqueryWarehouse(warehouseConfig.bigQuery);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);

            const bigqueryRowValues = [
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00 (+00:00)',
                '2020-08-12, 07:58 (+00:00)',
                '2020-08-12, 07 (+00:00)',
                '2020-08-12',
                '4', // Returns values in the range [1,7] with Sunday as the first day of the week.
                'Wednesday',
                '12',
                '225',
                '2020-08-09',
                '32',
                '2020-08',
                '8',
                'August',
                '2020-Q3',
                '3',
                'Q3',
                '2020',
                '2020',
                '7',
                '58',
            ];

            testTimeIntervalsResults(projectUuid, bigqueryRowValues);

            testPercentile(projectUuid, [
                '2020-08-12',
                '1,999',
                '1,559',
                '1,999',
                '19,999,999',
            ]);
        });
    });
    // note: we don't have a staging environment for Trino atm
    it.skip('Should create a Trino project', () => {
        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('Trino').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.trino.name);
        configureTrinoWarehouse(warehouseConfig.trino);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);

            const trinoRowValues = [
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00 (+00:00)',
                '2020-08-12, 07:58 (+00:00)',
                '2020-08-12, 07 (+00:00)',
                '2020-08-12',
                '3',
                'Wednesday',
                '12',
                '225',
                '2020-08-10',
                '2020-08',
                '8',
                'August',
                '2020-Q3',
                '3',
                'Q3',
                '2020',
                '2020',
            ];

            testTimeIntervalsResults(projectUuid, trinoRowValues);
            testPercentile(projectUuid);

            createCustomDimensionChart(projectUuid);
            testCustomDimensions(projectUuid);
        });
    });
    it.skip('Should create a Databricks project', () => {
        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('Databricks').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.databricks.name);
        configureDatabricksWarehouse(warehouseConfig.databricks);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);

            const databricksRowValues = [
                '2020-07-02, 09:33:00:000 (+00:00)',
                '2020-07-02, 09:33:00:000 (+00:00)',
                '2020-07-02, 09:33:00 (+00:00)',
                '2020-07-02, 09:33 (+00:00)',
                '2020-07-02, 09 (+00:00)',
                '2020-07-02',
                '5',
                'Thursday',
                '2',
                '184',
                '2020-06-29',
                '2020-07',
                '7',
                'July',
                '2020-Q3',
                '3',
                'Q3',
                '2020',
                '2020',
            ];

            testTimeIntervalsResults(projectUuid, databricksRowValues);
            testPercentile(projectUuid);

            createCustomDimensionChart(projectUuid);
            testCustomDimensions(projectUuid);
        });
    });

    it('Should create a Snowflake project', () => {
        cy.visit(`/createProject`);

        cy.get('[role="button"').contains('Snowflake').click();
        cy.get('[role="button"').contains('Manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type(warehouseConfig.snowflake.name);
        configureSnowflakeWarehouse(warehouseConfig.snowflake);

        testCompile().then((projectUuid) => {
            testFilterStringEscaping(projectUuid);

            const snowflakeRowValues = [
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00:000 (+00:00)',
                '2020-08-12, 07:58:00 (+00:00)',
                '2020-08-12, 07:58 (+00:00)',
                '2020-08-12, 07 (+00:00)',
                '2020-08-12',
                '3', // The behavior of week-related functions in Snowflake is controlled by the WEEK_START session parameters.
                'Wednesday',
                '12',
                '225',
                '2020-08-10',
                '33',
                '2020-08',
                '8',
                'August',
                '2020-Q3',
                '3',
                'Q3',
                '2020',
                '2020',
                '7',
                '58',
            ];

            testTimeIntervalsResults(projectUuid, snowflakeRowValues);
            testPercentile(projectUuid, [
                '2020-08-12',
                '1,999',
                '1,719.5',
                '1,999',
                '10,999,999',
            ]);

            // createCustomDimensionChart(projectUuid);
            // testCustomDimensions(projectUuid); // TODO enable after merging rounding fix
        });
    });
});
