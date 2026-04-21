import {
    CustomDimensionType,
    ResultRow,
    SEED_PROJECT,
} from '@lightdash/common';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures';
import { deleteProjectsByName, selectMantine } from '../../helpers';

const warehouseConfig = {
    postgresSQL: {
        name: 'Jaffle PostgreSQL test',
        host: process.env.PGHOST || 'db-dev',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    redshift: {
        name: 'Jaffle Redshift test',
        host: process.env.PGHOST || 'db-dev',
        user: 'postgres',
        password: process.env.PGPASSWORD || 'password',
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
        host: process.env.DATABRICKS_HOST || '',
        token: process.env.DATABRICKS_TOKEN || '',
        httpPath: process.env.DATABRICKS_PATH || '',
        schema: 'jaffle',
    },
    snowflake: {
        name: 'Jaffle Snowflake test',
        account: process.env.SNOWFLAKE_ACCOUNT || '',
        user: process.env.SNOWFLAKE_USER || '',
        password: process.env.SNOWFLAKE_PASSWORD || '',
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
    },
    trino: {
        name: 'Jaffle Trino test',
        host: process.env.TRINO_HOST || '',
        port: process.env.TRINO_PORT || '',
        user: process.env.TRINO_USER || '',
        password: process.env.TRINO_PASSWORD || '',
        database: 'e2e_jaffle_shop',
        schema: 'e2e_jaffle_shop',
    },
};

const configurePostgresWarehouse = async (
    page: Page,
    config: (typeof warehouseConfig)['postgresSQL'],
) => {
    await page.locator('input[name="warehouse.host"]').fill(config.host);
    await page.locator('input[name="warehouse.user"]').fill(config.user);
    await page
        .locator('input[name="warehouse.password"]')
        .fill(config.password);
    await page.locator('input[name="warehouse.dbname"]').fill(config.database);

    // There are separate Advanced configuration sections for warehouse and
    // dbt; the first one corresponds to the warehouse block above.
    await page
        .getByRole('button', { name: 'Advanced configuration options' })
        .first()
        .click();

    await page.locator('input[name="warehouse.port"]').clear();
    await page.locator('input[name="warehouse.port"]').fill(config.port);
    await selectMantine(page, 'warehouse.sslmode', 'disable');

    // DBT
    await selectMantine(page, 'dbt.type', 'dbt local server');
    await page.locator('input[name="dbt.target"]').fill('test');
    await page.locator('input[name="warehouse.schema"]').fill(config.schema);
};

const configureBigqueryWarehouse = async (
    page: Page,
    config: (typeof warehouseConfig)['bigQuery'],
) => {
    await page.locator('input[name="warehouse.project"]').fill(config.project);
    await page
        .locator('input[name="warehouse.location"]')
        .fill(config.location);

    await page.locator('[type="file"]').setInputFiles(config.keyFile);

    // DBT
    await selectMantine(page, 'dbt.type', 'dbt local server');
    await page.locator('input[name="dbt.target"]').fill('test');
    await page.locator('input[name="warehouse.dataset"]').fill(config.dataset);
};

const configureTrinoWarehouse = async (
    page: Page,
    config: (typeof warehouseConfig)['trino'],
) => {
    await page.locator('input[name="warehouse.host"]').fill(config.host);
    await page.locator('input[name="warehouse.user"]').fill(config.user);
    await page
        .locator('input[name="warehouse.password"]')
        .fill(config.password);
    await page.locator('input[name="warehouse.dbname"]').fill(config.database);

    await page
        .locator('a')
        .filter({ hasText: 'Advanced configuration options' })
        .click();

    await page.locator('input[name="warehouse.port"]').clear();
    await page.locator('input[name="warehouse.port"]').fill(config.port);
    await page
        .locator('select[name="warehouse.http_scheme"]')
        .selectOption('https');

    // DBT
    await selectMantine(page, 'dbt.type', 'dbt local server');
    await page.locator('input[name="dbt.target"]').fill('test');
    await page.locator('input[name="warehouse.schema"]').fill(config.schema);
};

const configureDatabricksWarehouse = async (
    page: Page,
    config: (typeof warehouseConfig)['databricks'],
) => {
    await page
        .locator('input[name="warehouse.serverHostName"]')
        .fill(config.host);
    await page
        .locator('input[name="warehouse.httpPath"]')
        .fill(config.httpPath);
    await page
        .locator('input[name="warehouse.personalAccessToken"]')
        .fill(config.token);

    // DBT
    await selectMantine(page, 'dbt.type', 'dbt local server');
    await page.locator('input[name="dbt.target"]').fill('test');
    await page.locator('input[name="warehouse.database"]').fill(config.schema);
};

const configureSnowflakeWarehouse = async (
    page: Page,
    config: (typeof warehouseConfig)['snowflake'],
) => {
    await page.locator('input[name="warehouse.account"]').fill(config.account);
    await page.locator('input[name="warehouse.user"]').fill(config.user);

    await selectMantine(page, 'warehouse.authenticationType', 'Password');

    await page
        .locator('input[name="warehouse.password"]')
        .fill(config.password);
    await page.locator('input[name="warehouse.role"]').fill(config.role);
    await page
        .locator('input[name="warehouse.database"]')
        .fill(config.database);
    await page
        .locator('input[name="warehouse.warehouse"]')
        .fill(config.warehouse);

    // DBT
    await selectMantine(page, 'dbt.type', 'dbt local server');
    await page.locator('input[name="dbt.target"]').fill('test');
    await page.locator('input[name="warehouse.schema"]').fill(config.schema);
};

const testCompile = async (page: Page): Promise<string> => {
    // Compile. The jaffle-shop demo has enough models that a cold dbt
    // compile comfortably exceeds 60s on CI, so give each step 2 minutes.
    await page.getByText('Test & deploy project').click();
    await expect(page.getByText('Step 1/3')).toBeVisible({
        timeout: 120000,
    });
    await expect(page.getByText('Step 2/3')).toBeVisible({
        timeout: 120000,
    });
    await expect(
        page.getByText('Successfully synced dbt project!'),
    ).toBeVisible({ timeout: 120000 });

    await expect(page.getByText(/selected \d+ models/)).toBeVisible();
    // Configure
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 30000 });
    await expect(page.getByText('Welcome, David')).toBeVisible();
    await expect(page.getByText('Charts and Dashboards')).toBeVisible();
    await expect(
        page.getByText('get started by creating some charts'),
    ).toBeVisible();
    await page.waitForTimeout(1000);

    const url = page.url();
    return url.split('/')[4];
};

const testFilterStringEscaping = async (
    request: APIRequestContext,
    projectUuid: string,
) => {
    const response = await request.post(
        `api/v1/projects/${projectUuid}/explores/customers/runQuery`,
        {
            headers: { 'Content-type': 'application/json' },
            data: {
                exploreName: 'customers',
                dimensions: ['customers_first_name'],
                metrics: [],
                filters: {
                    dimensions: {
                        id: '7c015e80-7407-431f-b4bf-d3f5bd74ffc7',
                        and: [
                            {
                                id: 'e0c85f24-69c0-4a34-bc2a-f598eb7e26c9',
                                target: {
                                    fieldId: 'customers_first_name',
                                },
                                operator: 'equals',
                                values: ["Quo'te"],
                            },
                        ],
                    },
                },
                sorts: [
                    {
                        fieldId: 'customers_first_name',
                        descending: false,
                    },
                ],
                limit: 1,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
    );
    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.results.rows[0].customers_first_name.value.raw).toBe("Quo'te");
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

const percentileRowValues = ['2020-08-11', '1,315', '836', '1,315', '1,808'];

const testPercentile = async (
    request: APIRequestContext,
    projectUuid: string,
    rowValues = percentileRowValues,
) => {
    const response = await request.post(
        `api/v1/projects/${projectUuid}/explores/events/runQuery`,
        {
            headers: { 'Content-type': 'application/json' },
            data: {
                exploreName: 'events',
                dimensions: ['events_timestamp_tz_day'],
                metrics: [
                    'events_median',
                    'events_percentile_25',
                    'events_percentile_50',
                    'events_percentile_75',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_timestamp_tz_day',
                        descending: true,
                    },
                ],
                limit: 1,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
    );
    const body = await response.json();
    expect(response.status()).toBe(200);
    rowValues.forEach((value, index) => {
        expect(
            Object.values(body.results.rows[0] as ResultRow)[index].value
                .formatted,
        ).toBe(value);
    });
};

const testTimeIntervalsResults = async (
    request: APIRequestContext,
    projectUuid: string,
    rowValues = defaultRowValues,
) => {
    const response = await request.post(
        `api/v1/projects/${projectUuid}/explores/events/runQuery`,
        {
            headers: { 'Content-type': 'application/json' },
            data: {
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
                sorts: [
                    {
                        fieldId: 'events_timestamp_tz_raw',
                        descending: true,
                    },
                ],
                limit: 1,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
    );
    const body = await response.json();
    expect(response.status()).toBe(200);
    rowValues.forEach((value, index) => {
        expect(
            Object.values(body.results.rows[0] as ResultRow)[
                index
            ].value.formatted.trim(),
        ).toBe(value);
    });
};

const apiUrl = '/api/v1';

const createCustomDimensionChart = async (
    request: APIRequestContext,
    projectUuid: string,
) => {
    const response = await request.post(
        `${apiUrl}/projects/${projectUuid}/saved`,
        {
            data: {
                name: 'How do payment methods vary across different amount ranges?',
                description: 'Payment range by amount',
                tableName: 'payments',
                metricQuery: {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_method', 'amount_range'],
                    metrics: ['orders_total_order_amount'],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_total_order_amount',
                            descending: true,
                        },
                    ],
                    limit: 1,
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
        },
    );
    expect(response.status()).toBe(200);
};

const testCustomDimensions = async (page: Page, projectUuid: string) => {
    await page.goto(`/projects/${projectUuid}/saved`);
    await page.getByText('How do payment methods vary').click();
    await expect(page.getByText('0 - 6')).toBeVisible();
    await expect(page.getByText('6 - 12')).toBeVisible();
};

test.describe('Create projects', () => {
    // Creating a project runs a full dbt compile against the warehouse,
    // which the jaffle-shop demo needs well over the default 30s for.
    test.setTimeout(240000);

    test.beforeAll(async ({ browser, adminState }) => {
        // clean previous e2e projects
        const context = await browser.newContext({
            storageState: JSON.parse(adminState),
        });
        const page = await context.newPage();
        const projectNames = Object.values(warehouseConfig).map<string>(
            ({ name }) => name,
        );
        await deleteProjectsByName(page.request, projectNames);
        await context.close();
    });

    test.skip('I can create a custom dimension chart from api', async ({
        adminPage: page,
    }) => {
        // you can enable this if you want to test this directly
        await createCustomDimensionChart(
            page.request,
            SEED_PROJECT.project_uuid,
        );
    });

    test.skip('I can view an existing custom dimension chart', async ({
        adminPage: page,
    }) => {
        // you can enable this if you want to test this directly
        await testCustomDimensions(page, SEED_PROJECT.project_uuid);
    });

    test.skip('Should be able to create new project from settings', async ({
        adminPage: page,
    }) => {
        await page.goto(`/`);

        await page.getByTestId('settings-menu').first().click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Projects').click();
        await page.getByText('Create new').click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'PostgreSQL' })
            .click();

        await expect(page).toHaveURL(/\/createProject\/cli/);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
    });

    test('Should create a Postgres project', async ({ adminPage: page }) => {
        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'PostgreSQL' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.postgresSQL.name);
        await configurePostgresWarehouse(page, warehouseConfig.postgresSQL);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);
        await testTimeIntervalsResults(page.request, projectUuid);
    });

    test.skip('Should create a Redshift project', async ({
        adminPage: page,
    }) => {
        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Redshift' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page.locator('[name="name"]').fill(warehouseConfig.redshift.name);
        await configurePostgresWarehouse(page, warehouseConfig.redshift);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);
        await testTimeIntervalsResults(page.request, projectUuid);
        await testPercentile(page.request, projectUuid);

        await createCustomDimensionChart(page.request, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });

    test('Should create a Bigquery project', async ({ adminPage: page }) => {
        // Skip when the BigQuery keyfile isn't available (e.g. on PRs from
        // forks that can't access the secret).
        const { existsSync } = await import('fs');
        test.skip(
            !existsSync(warehouseConfig.bigQuery.keyFile),
            `${warehouseConfig.bigQuery.keyFile} not found`,
        );

        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'BigQuery' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page.locator('[name="name"]').fill(warehouseConfig.bigQuery.name);
        await configureBigqueryWarehouse(page, warehouseConfig.bigQuery);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);

        const bigqueryRowValues = [
            '2020-08-12, 07:58:00:000 (+00:00)',
            '2020-08-12, 07:58:00:000 (+00:00)',
            '2020-08-12, 07:58:00 (+00:00)',
            '2020-08-12, 07:58 (+00:00)',
            '2020-08-12, 07 (+00:00)',
            '2020-08-12',
            '4',
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

        await testTimeIntervalsResults(
            page.request,
            projectUuid,
            bigqueryRowValues,
        );
    });

    // note: we don't have a staging environment for Trino atm
    test.skip('Should create a Trino project', async ({ adminPage: page }) => {
        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Trino' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page.locator('[name="name"]').fill(warehouseConfig.trino.name);
        await configureTrinoWarehouse(page, warehouseConfig.trino);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);

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

        await testTimeIntervalsResults(
            page.request,
            projectUuid,
            trinoRowValues,
        );
        await testPercentile(page.request, projectUuid);

        await createCustomDimensionChart(page.request, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });

    test.skip('Should create a Databricks project', async ({
        adminPage: page,
    }) => {
        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Databricks' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.databricks.name);
        await configureDatabricksWarehouse(page, warehouseConfig.databricks);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);

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

        await testTimeIntervalsResults(
            page.request,
            projectUuid,
            databricksRowValues,
        );
        await testPercentile(page.request, projectUuid);

        await createCustomDimensionChart(page.request, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });

    test('Should create a Snowflake project', async ({ adminPage: page }) => {
        // Skip when Snowflake credentials aren't set (e.g. on PRs from forks
        // that can't access the secret).
        test.skip(
            !warehouseConfig.snowflake.account ||
                !warehouseConfig.snowflake.user ||
                !warehouseConfig.snowflake.password,
            'Snowflake credentials not configured',
        );

        await page.goto(`/createProject`);

        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Snowflake' })
            .click();
        await page
            .locator('[role="button"]')
            .filter({ hasText: 'Manually' })
            .click();
        await page.getByRole('button', { name: /I.?ve defined them!/ }).click();

        await page.locator('[name="name"]').clear();
        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.snowflake.name);
        await configureSnowflakeWarehouse(page, warehouseConfig.snowflake);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(page.request, projectUuid);

        const snowflakeRowValues = [
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

        await testTimeIntervalsResults(
            page.request,
            projectUuid,
            snowflakeRowValues,
        );
    });
});
