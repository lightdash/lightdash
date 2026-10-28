import {
    CustomDimensionType,
    JobStatusType,
    ResultRow,
    SEED_PROJECT,
} from '@lightdash/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    deleteProjectsByName,
    env,
    expect,
    json,
    loginAs,
    PACKAGE_ROOT,
    SEED_USERS,
    selectMantine,
    test,
    TrackedApi,
    type Page,
} from '../../support/test';

const BIGQUERY_KEY_FILE = join(PACKAGE_ROOT, 'fixtures/credentials.json');

const warehouseConfig = {
    postgresSQL: {
        name: 'Jaffle PostgreSQL test',
        host: env('PGHOST') || 'db-dev',
        user: env('PGUSER') || 'postgres',
        password: env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    redshift: {
        name: 'Jaffle Redshift test',
        host: env('PGHOST') || 'db-dev',
        user: 'postgres',
        password: env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    bigQuery: {
        name: 'Jaffle Bigquery test',
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyFile: BIGQUERY_KEY_FILE,
    },
    databricks: {
        name: 'Jaffle Databricks test',
        host: env('DATABRICKS_HOST') ?? '',
        token: env('DATABRICKS_TOKEN') ?? '',
        httpPath: env('DATABRICKS_PATH') ?? '',
        schema: 'jaffle',
    },
    snowflake: {
        name: 'Jaffle Snowflake test',
        account: env('SNOWFLAKE_ACCOUNT') ?? '',
        user: env('SNOWFLAKE_USER') ?? '',
        password: env('SNOWFLAKE_PASSWORD') ?? '',
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
    },
    trino: {
        name: 'Jaffle Trino test',
        host: env('TRINO_HOST') ?? '',
        port: env('TRINO_PORT') ?? '',
        user: env('TRINO_USER') ?? '',
        password: env('TRINO_PASSWORD') ?? '',
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

    await page
        .getByRole('button', { name: 'Advanced configuration options' })
        .first()
        .click();

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
    /*
    await selectMantine(
        page,
        'warehouse.authenticationType',
        'Service Account (JSON key file)',
    ); */

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
        .locator('a', { hasText: 'Advanced configuration options' })
        .click();

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

// The app polls the compile job every 500ms; allow about 3 minutes for it to finish
const waitForCompileJob = (page: Page) =>
    page.waitForResponse(
        async (response) => {
            if (
                response.request().method() !== 'GET' ||
                !/\/api\/v1\/jobs\/[^/]+$/.test(
                    new URL(response.url()).pathname,
                )
            ) {
                return false;
            }
            const body = (await response.json().catch(() => null)) as {
                results?: { jobStatus: JobStatusType; steps: unknown };
            } | null;
            const job = body?.results;
            if (job?.jobStatus === JobStatusType.ERROR) {
                throw new Error(
                    `Compile job failed: ${JSON.stringify(job.steps)}`,
                );
            }
            return job?.jobStatus === JobStatusType.DONE;
        },
        { timeout: 180_000 },
    );

const testCompile = async (page: Page): Promise<string> => {
    // Compile
    const compileJob = waitForCompileJob(page);
    const deployButton = page.getByRole('button', {
        name: 'Test & deploy project',
    });
    await expect(deployButton).toBeEnabled({ timeout: 30_000 });
    await deployButton.click();
    await compileJob;

    await expect(page).toHaveURL(/\/createProjectSettings/, {
        timeout: 30_000,
    });
    await expect(
        page.getByText('Your project has connected successfully!'),
    ).toBeVisible();
    await expect(page.getByText(/selected \d+ models/)).toBeVisible();
    // Configure
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
    // get new project uuid
    return page.url().split('/')[4];
};

const testFilterStringEscaping = async (
    api: TrackedApi,
    projectUuid: string,
) => {
    const resp = await api.post(
        `/api/v1/projects/${projectUuid}/explores/customers/runQuery`,
        {
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
                                target: { fieldId: 'customers_first_name' },
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
    expect(resp.status()).toBe(200);
    const { rows } = await json<{ rows: ResultRow[] }>(resp);
    expect(rows[0].customers_first_name.value.raw).toBe("Quo'te");
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
    api: TrackedApi,
    projectUuid: string,
    rowValues = percentileRowValues,
) => {
    const resp = await api.post(
        `/api/v1/projects/${projectUuid}/explores/events/runQuery`,
        {
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
    expect(resp.status()).toBe(200);
    const { rows } = await json<{ rows: ResultRow[] }>(resp);
    // check first row values
    rowValues.forEach((value, index) => {
        expect(Object.values(rows[0])[index].value.formatted).toBe(value);
    });
};

const testTimeIntervalsResults = async (
    api: TrackedApi,
    projectUuid: string,
    rowValues = defaultRowValues,
) => {
    const resp = await api.post(
        `/api/v1/projects/${projectUuid}/explores/events/runQuery`,
        {
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
    expect(resp.status()).toBe(200);
    const { rows } = await json<{ rows: ResultRow[] }>(resp);
    // check first row values
    rowValues.forEach((value, index) => {
        expect(Object.values(rows[0])[index].value.formatted.trim()).toBe(
            value,
        );
    });
};

const apiUrl = '/api/v1';

const createCustomDimensionChart = async (
    api: TrackedApi,
    projectUuid: string,
) => {
    // This is used by create project to quickly create a custom dimension chart
    // because we don't have charts on new projects created by the e2e tests

    // This metric query is the same in `02_saved_queries`
    const r = await api.post(`${apiUrl}/projects/${projectUuid}/saved`, {
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
    });
    expect(r.status()).toBe(200);
};

const testCustomDimensions = async (page: Page, projectUuid: string) => {
    // Test custom dimension by going into an existing chart with custom dimensions and running the query
    // This is also used in createProject.cy.ts to test custom dimensions against all warehouses
    await page.goto(`/projects/${projectUuid}/saved`);
    await page.getByText('How do payment methods vary').click();
    await expect(page.getByText('0 - 6')).toBeVisible();
    await expect(page.getByText('6 - 12')).toBeVisible();
};

const pickWarehouse = async (page: Page, warehouse: string) => {
    await page.goto(`/createProject`);

    await page.locator('[role="button"]', { hasText: warehouse }).click();
    await page.locator('[role="button"]', { hasText: 'Manually' }).click();
    await page.getByRole('button', { name: 'I’ve defined them!' }).click();
};

test.describe('Create projects', () => {
    // Each project compiles dbt, which can take minutes
    test.describe.configure({ timeout: 300_000 });

    test.beforeAll(async ({ request }) => {
        await loginAs(request, SEED_USERS.admin);
        // clean previous e2e projects
        const projectNames = Object.values(warehouseConfig).map<string>(
            ({ name }) => name,
        );
        await deleteProjectsByName(request, projectNames);
    });

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test.skip('I can create a custom dimension chart from api', async ({
        api,
    }) => {
        // you can enable this if you want to test this directly
        await createCustomDimensionChart(api, SEED_PROJECT.project_uuid);
    });
    test.skip('I can view an existing custom dimension chart', async ({
        page,
    }) => {
        // you can enable this if you want to test this directly
        await testCustomDimensions(page, SEED_PROJECT.project_uuid);
    });
    test.skip('Should be able to create new project from settings', async ({
        page,
    }) => {
        await page.goto(`/`);

        await page.getByTestId('settings-menu').click();
        await page
            .getByRole('menuitem', { name: 'Organization settings' })
            .click();

        await page.getByText('Projects', { exact: true }).click();
        await page.getByText('Create new', { exact: true }).click();
        await page
            .locator('[role="button"]', { hasText: 'PostgreSQL' })
            .click();

        await expect(page).toHaveURL(/\/createProject\/cli/);

        await page.locator('[role="button"]', { hasText: 'Manually' }).click();
    });

    test('Should create a Postgres project', async ({ page, api }) => {
        await pickWarehouse(page, 'PostgreSQL');

        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.postgresSQL.name);
        await configurePostgresWarehouse(page, warehouseConfig.postgresSQL);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);
        await testTimeIntervalsResults(api, projectUuid);
        // todo: move to unit test
        // await testPercentile(api, projectUuid);

        // todo: move to api/unit test
        // await createCustomDimensionChart(api, projectUuid);
        // await testCustomDimensions(page, projectUuid);
    });
    test.skip('Should create a Redshift project', async ({ page, api }) => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        await pickWarehouse(page, 'Redshift');

        await page.locator('[name="name"]').fill(warehouseConfig.redshift.name);
        await configurePostgresWarehouse(page, warehouseConfig.redshift);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);
        await testTimeIntervalsResults(api, projectUuid);
        await testPercentile(api, projectUuid);

        await createCustomDimensionChart(api, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });
    test('Should create a Bigquery project', async ({ page, api }) => {
        test.skip(!existsSync(BIGQUERY_KEY_FILE), 'needs BigQuery credentials');
        await pickWarehouse(page, 'BigQuery');

        await page.locator('[name="name"]').fill(warehouseConfig.bigQuery.name);
        await configureBigqueryWarehouse(page, warehouseConfig.bigQuery);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);

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

        await testTimeIntervalsResults(api, projectUuid, bigqueryRowValues);

        // todo: move to unit test
        // await testPercentile(api, projectUuid, [
        //     '2020-08-12',
        //     '1,999',
        //     '1,559',
        //     '1,999',
        //     '19,999,999',
        // ]);
    });
    // note: we don't have a staging environment for Trino atm
    test.skip('Should create a Trino project', async ({ page, api }) => {
        await pickWarehouse(page, 'Trino');

        await page.locator('[name="name"]').fill(warehouseConfig.trino.name);
        await configureTrinoWarehouse(page, warehouseConfig.trino);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);

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

        await testTimeIntervalsResults(api, projectUuid, trinoRowValues);
        await testPercentile(api, projectUuid);

        await createCustomDimensionChart(api, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });
    test.skip('Should create a Databricks project', async ({ page, api }) => {
        await pickWarehouse(page, 'Databricks');

        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.databricks.name);
        await configureDatabricksWarehouse(page, warehouseConfig.databricks);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);

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

        await testTimeIntervalsResults(api, projectUuid, databricksRowValues);
        await testPercentile(api, projectUuid);

        await createCustomDimensionChart(api, projectUuid);
        await testCustomDimensions(page, projectUuid);
    });

    test('Should create a Snowflake project', async ({ page, api }) => {
        await pickWarehouse(page, 'Snowflake');

        await page
            .locator('[name="name"]')
            .fill(warehouseConfig.snowflake.name);
        await configureSnowflakeWarehouse(page, warehouseConfig.snowflake);

        const projectUuid = await testCompile(page);
        await testFilterStringEscaping(api, projectUuid);

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

        await testTimeIntervalsResults(api, projectUuid, snowflakeRowValues);
        // todo: move to unit test
        // await testPercentile(api, projectUuid, [
        //     '2020-08-12',
        //     '2,000',
        //     '1,880',
        //     '2,000',
        //     '1,999,999',
        // ]);

        // await createCustomDimensionChart(api, projectUuid);
        // await testCustomDimensions(page, projectUuid); // TODO enable after merging rounding fix
    });
});
