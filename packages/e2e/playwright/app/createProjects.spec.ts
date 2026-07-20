import {
    assertUnreachable,
    DbtProjectType,
    getErrorMessage,
    JobStatusType,
    JobType,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SnowflakeAuthenticationType,
} from '@lightdash/common';
import {
    expect,
    request as playwrightRequest,
    test,
    type APIRequestContext,
    type Page,
} from '@playwright/test';
import { randomUUID } from 'crypto';

const COMPILE_JOB_TIMEOUT_MS = 180_000;
const COMPILE_JOB_POLL_INTERVAL_MS = 500;
const POST_COMPILE_AND_CLEANUP_TIMEOUT_MS = 120_000;
// Compile gets 180s; navigation, warehouse queries, and cleanup share 120s.
const WAREHOUSE_TEST_TIMEOUT_MS =
    COMPILE_JOB_TIMEOUT_MS + POST_COMPILE_AND_CLEANUP_TIMEOUT_MS;

const stagingWarehouse = {
    postgres: {
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    bigQuery: {
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
    },
    snowflake: {
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
    },
    dbtTarget: 'test',
};

const quoteFilterGroupUuid = '7c015e80-7407-431f-b4bf-d3f5bd74ffc7';
const quoteFilterRuleUuid = 'e0c85f24-69c0-4a34-bc2a-f598eb7e26c9';

type TimeIntervalExpectations = {
    events_timestamp_tz_raw: string;
    events_timestamp_tz_millisecond: string;
    events_timestamp_tz_second: string;
    events_timestamp_tz_minute: string;
    events_timestamp_tz_hour: string;
    events_timestamp_tz_day: string;
    events_timestamp_tz_day_of_week_index: string;
    events_timestamp_tz_day_of_week_name: string;
    events_timestamp_tz_day_of_month_num: string;
    events_timestamp_tz_day_of_year_num: string;
    events_timestamp_tz_week: string;
    events_timestamp_tz_week_num: string;
    events_timestamp_tz_month: string;
    events_timestamp_tz_month_num: string;
    events_timestamp_tz_month_name: string;
    events_timestamp_tz_quarter: string;
    events_timestamp_tz_quarter_num: string;
    events_timestamp_tz_quarter_name: string;
    events_timestamp_tz_year: string;
    events_timestamp_tz_year_num: string;
    events_timestamp_tz_hour_of_day_num: string;
    events_timestamp_tz_minute_of_hour_num: string;
};

const postgresTimeIntervals = {
    events_timestamp_tz_raw: '2020-08-11, 23:44:00:000 (+00:00)',
    events_timestamp_tz_millisecond: '2020-08-11, 23:44:00:000 (+00:00)',
    events_timestamp_tz_second: '2020-08-11, 23:44:00 (+00:00)',
    events_timestamp_tz_minute: '2020-08-11, 23:44 (+00:00)',
    events_timestamp_tz_hour: '2020-08-11, 23 (+00:00)',
    events_timestamp_tz_day: '2020-08-11',
    events_timestamp_tz_day_of_week_index: '2',
    events_timestamp_tz_day_of_week_name: 'Tuesday',
    events_timestamp_tz_day_of_month_num: '11',
    events_timestamp_tz_day_of_year_num: '224',
    events_timestamp_tz_week: '2020-08-10',
    events_timestamp_tz_week_num: '33',
    events_timestamp_tz_month: '2020-08',
    events_timestamp_tz_month_num: '8',
    events_timestamp_tz_month_name: 'August',
    events_timestamp_tz_quarter: '2020-Q3',
    events_timestamp_tz_quarter_num: '3',
    events_timestamp_tz_quarter_name: 'Q3',
    events_timestamp_tz_year: '2020',
    events_timestamp_tz_year_num: '2020',
    events_timestamp_tz_hour_of_day_num: '23',
    events_timestamp_tz_minute_of_hour_num: '44',
} satisfies TimeIntervalExpectations;

const bigQueryTimeIntervals = {
    events_timestamp_tz_raw: '2020-08-12, 07:58:00:000 (+00:00)',
    events_timestamp_tz_millisecond: '2020-08-12, 07:58:00:000 (+00:00)',
    events_timestamp_tz_second: '2020-08-12, 07:58:00 (+00:00)',
    events_timestamp_tz_minute: '2020-08-12, 07:58 (+00:00)',
    events_timestamp_tz_hour: '2020-08-12, 07 (+00:00)',
    events_timestamp_tz_day: '2020-08-12',
    events_timestamp_tz_day_of_week_index: '4',
    events_timestamp_tz_day_of_week_name: 'Wednesday',
    events_timestamp_tz_day_of_month_num: '12',
    events_timestamp_tz_day_of_year_num: '225',
    events_timestamp_tz_week: '2020-08-09',
    events_timestamp_tz_week_num: '32',
    events_timestamp_tz_month: '2020-08',
    events_timestamp_tz_month_num: '8',
    events_timestamp_tz_month_name: 'August',
    events_timestamp_tz_quarter: '2020-Q3',
    events_timestamp_tz_quarter_num: '3',
    events_timestamp_tz_quarter_name: 'Q3',
    events_timestamp_tz_year: '2020',
    events_timestamp_tz_year_num: '2020',
    events_timestamp_tz_hour_of_day_num: '7',
    events_timestamp_tz_minute_of_hour_num: '58',
} satisfies TimeIntervalExpectations;

const snowflakeTimeIntervals = {
    events_timestamp_tz_raw: '2020-08-12, 07:58:00:000 (+00:00)',
    events_timestamp_tz_millisecond: '2020-08-12, 07:58:00:000 (+00:00)',
    events_timestamp_tz_second: '2020-08-12, 07:58:00 (+00:00)',
    events_timestamp_tz_minute: '2020-08-12, 07:58 (+00:00)',
    events_timestamp_tz_hour: '2020-08-12, 07 (+00:00)',
    events_timestamp_tz_day: '2020-08-12',
    events_timestamp_tz_day_of_week_index: '3',
    events_timestamp_tz_day_of_week_name: 'Wednesday',
    events_timestamp_tz_day_of_month_num: '12',
    events_timestamp_tz_day_of_year_num: '225',
    events_timestamp_tz_week: '2020-08-10',
    events_timestamp_tz_week_num: '33',
    events_timestamp_tz_month: '2020-08',
    events_timestamp_tz_month_num: '8',
    events_timestamp_tz_month_name: 'August',
    events_timestamp_tz_quarter: '2020-Q3',
    events_timestamp_tz_quarter_num: '3',
    events_timestamp_tz_quarter_name: 'Q3',
    events_timestamp_tz_year: '2020',
    events_timestamp_tz_year_num: '2020',
    events_timestamp_tz_hour_of_day_num: '7',
    events_timestamp_tz_minute_of_hour_num: '58',
} satisfies TimeIntervalExpectations;

type PostgresWarehouseConfig = {
    host: string;
    user: string;
    password: string;
    database: string;
    port: string;
    schema: string;
};

type BigQueryWarehouseConfig = {
    project: string;
    location: string;
    dataset: string;
    credentialsPath: string;
};

type SnowflakeAuthentication =
    | {
          type: SnowflakeAuthenticationType.PASSWORD;
          password: string;
      }
    | {
          type: SnowflakeAuthenticationType.PRIVATE_KEY;
          privateKeyPath: string;
          privateKeyPassphrase: string | null;
      };

type SnowflakeWarehouseConfig = {
    account: string;
    user: string;
    authentication: SnowflakeAuthentication;
    role: string;
    database: string;
    warehouse: string;
    schema: string;
};

type ProjectLedger = {
    projectName: string;
    projectUuid: string | null;
    jobUuid: string | null;
    creationAttempted: boolean;
};

type OrganizationProjectIdentity = {
    projectUuid: string;
    name: string;
};

type QueryResultValue = {
    raw: unknown;
    formatted: string;
};

type ParsedCreateProjectJob =
    | {
          state: 'pending';
          jobStatus: JobStatusType.STARTED | JobStatusType.RUNNING;
          steps: unknown[];
      }
    | {
          state: 'done';
          jobStatus: JobStatusType.DONE;
          projectUuid: string;
          steps: unknown[];
      }
    | {
          state: 'error';
          jobStatus: JobStatusType.ERROR;
          steps: unknown[];
      };

let activeProject: ProjectLedger | null = null;

const requireEnvironmentVariable = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} is required for this test`);
    }
    return value;
};

const optionalEnvironmentVariable = (name: string): string | null => {
    const value = process.env[name];
    return value === undefined || value.length === 0 ? null : value;
};

const requireUtc = (): void => {
    if (process.env.TZ !== 'UTC') {
        throw new Error('TZ must be UTC for warehouse timestamp assertions');
    }
};

const getPostgresWarehouseConfig = (): PostgresWarehouseConfig => ({
    host: requireEnvironmentVariable('PGHOST'),
    user: requireEnvironmentVariable('PGUSER'),
    password: requireEnvironmentVariable('PGPASSWORD'),
    database: stagingWarehouse.postgres.database,
    port: stagingWarehouse.postgres.port,
    schema: stagingWarehouse.postgres.schema,
});

const getBigQueryWarehouseConfig = (): BigQueryWarehouseConfig => ({
    project: stagingWarehouse.bigQuery.project,
    location: stagingWarehouse.bigQuery.location,
    dataset: stagingWarehouse.bigQuery.dataset,
    credentialsPath: requireEnvironmentVariable('GCP_CREDENTIALS_PATH'),
});

const getSnowflakeAuthentication = (): SnowflakeAuthentication => {
    const password = optionalEnvironmentVariable('SNOWFLAKE_PASSWORD');
    if (password !== null) {
        return {
            type: SnowflakeAuthenticationType.PASSWORD,
            password,
        };
    }

    return {
        type: SnowflakeAuthenticationType.PRIVATE_KEY,
        privateKeyPath: requireEnvironmentVariable(
            'SNOWFLAKE_PRIVATE_KEY_PATH',
        ),
        privateKeyPassphrase: optionalEnvironmentVariable(
            'SNOWFLAKE_PRIVATE_KEY_PASSPHRASE',
        ),
    };
};

const getSnowflakeWarehouseConfig = (): SnowflakeWarehouseConfig => ({
    account: requireEnvironmentVariable('SNOWFLAKE_ACCOUNT'),
    user: requireEnvironmentVariable('SNOWFLAKE_USER'),
    authentication: getSnowflakeAuthentication(),
    role: stagingWarehouse.snowflake.role,
    database: stagingWarehouse.snowflake.database,
    warehouse: stagingWarehouse.snowflake.warehouse,
    schema: stagingWarehouse.snowflake.schema,
});

const createProjectLedger = (warehouseName: string): ProjectLedger => {
    const ledger = {
        projectName: `Playwright ${warehouseName} ${randomUUID()}`,
        projectUuid: null,
        jobUuid: null,
        creationAttempted: false,
    };
    activeProject = ledger;
    return ledger;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const installDbtProjectDirectoryRoute = async (page: Page): Promise<void> => {
    const dbtProjectDirectory = requireEnvironmentVariable('DBT_PROJECT_DIR');

    await page.route('**/api/v1/org/projects/precompiled', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (
            request.method() !== 'POST' ||
            url.pathname !== '/api/v1/org/projects/precompiled' ||
            url.search !== ''
        ) {
            await route.continue();
            return;
        }

        const bodyText = request.postData();
        if (bodyText === null) {
            throw new Error('Create project request body is required');
        }

        let body: unknown;
        try {
            body = JSON.parse(bodyText);
        } catch (error: unknown) {
            throw new Error(
                `Create project request body must be JSON: ${getErrorMessage(error)}`,
            );
        }

        if (!isRecord(body) || !isRecord(body.dbtConnection)) {
            throw new Error(
                'Create project request must contain a dbt connection object',
            );
        }
        if (body.dbtConnection.type !== DbtProjectType.DBT) {
            throw new Error('Create project request must use local dbt');
        }

        // This body contains warehouse secrets; forward the copy without logging it.
        await route.continue({
            postData: JSON.stringify({
                ...body,
                dbtConnection: {
                    ...body.dbtConnection,
                    project_dir: dbtProjectDirectory,
                },
            }),
        });
    });
};

const readJson = async (response: {
    text: () => Promise<string>;
}): Promise<unknown> => {
    const text = await response.text();
    try {
        const value: unknown = JSON.parse(text);
        return value;
    } catch (error: unknown) {
        throw new Error(`Expected a JSON response: ${getErrorMessage(error)}`);
    }
};

const parseOkResults = (body: unknown, responseName: string): unknown => {
    if (!isRecord(body) || body.status !== 'ok') {
        throw new Error(`${responseName} did not return an ok response`);
    }
    return body.results;
};

const parseUuid = (value: unknown, fieldName: string): string => {
    if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        )
    ) {
        throw new Error(`${fieldName} must be a UUID`);
    }
    return value;
};

const parseCreateJobUuid = (body: unknown): string => {
    const results = parseOkResults(body, 'Create project');
    if (!isRecord(results)) {
        throw new Error('Create project results must be an object');
    }
    return parseUuid(results.jobUuid, 'Create project jobUuid');
};

const parseJobStatus = (value: unknown): JobStatusType => {
    switch (value) {
        case JobStatusType.STARTED:
        case JobStatusType.RUNNING:
        case JobStatusType.DONE:
        case JobStatusType.ERROR:
            return value;
        default:
            throw new Error('Create project job returned an unknown status');
    }
};

const parseCreateProjectJob = (
    body: unknown,
    expectedJobUuid: string,
): ParsedCreateProjectJob => {
    const results = parseOkResults(body, 'Create project job');
    if (!isRecord(results)) {
        throw new Error('Create project job results must be an object');
    }
    if (results.jobUuid !== expectedJobUuid) {
        throw new Error('Create project job returned a different jobUuid');
    }
    if (results.jobType !== JobType.CREATE_PROJECT) {
        throw new Error('Expected a create-project job');
    }
    if (!Array.isArray(results.steps)) {
        throw new Error('Create project job steps must be an array');
    }

    const jobStatus = parseJobStatus(results.jobStatus);
    switch (jobStatus) {
        case JobStatusType.STARTED:
        case JobStatusType.RUNNING:
            return {
                state: 'pending',
                jobStatus,
                steps: results.steps,
            };
        case JobStatusType.DONE: {
            if (!isRecord(results.jobResults)) {
                throw new Error('Completed create project job has no results');
            }
            return {
                state: 'done',
                jobStatus,
                projectUuid: parseUuid(
                    results.jobResults.projectUuid,
                    'Create project job projectUuid',
                ),
                steps: results.steps,
            };
        }
        case JobStatusType.ERROR:
            return {
                state: 'error',
                jobStatus,
                steps: results.steps,
            };
        default:
            return assertUnreachable(
                jobStatus,
                'Unknown create project job status',
            );
    }
};

const parseOrganizationProjects = (
    body: unknown,
): OrganizationProjectIdentity[] => {
    const results = parseOkResults(body, 'Organization projects');
    if (!Array.isArray(results)) {
        throw new Error('Organization project results must be an array');
    }

    return results.map((project, index) => {
        if (!isRecord(project) || typeof project.name !== 'string') {
            throw new Error(
                `Organization project at position ${index} is invalid`,
            );
        }
        return {
            projectUuid: parseUuid(
                project.projectUuid,
                `Organization project ${index} projectUuid`,
            ),
            name: project.name,
        };
    });
};

const parseFirstQueryRow = (body: unknown): Record<string, unknown> => {
    const results = parseOkResults(body, 'Warehouse query');
    if (!isRecord(results) || !Array.isArray(results.rows)) {
        throw new Error('Warehouse query results must contain rows');
    }
    const [firstRow] = results.rows;
    if (!isRecord(firstRow)) {
        throw new Error('Warehouse query must return a first row');
    }
    return firstRow;
};

const parseQueryResultValue = (
    row: Record<string, unknown>,
    fieldName: string,
): QueryResultValue => {
    const field = row[fieldName];
    if (!isRecord(field) || !isRecord(field.value)) {
        throw new Error(`Warehouse query field ${fieldName} has no value`);
    }
    if (typeof field.value.formatted !== 'string') {
        throw new Error(
            `Warehouse query field ${fieldName} has no formatted value`,
        );
    }
    return {
        raw: field.value.raw,
        formatted: field.value.formatted,
    };
};

const getTextbox = (page: Page, name: string) =>
    page.getByRole('textbox', { name, exact: true });

const selectOption = async (
    page: Page,
    label: string,
    option: string,
): Promise<void> => {
    await getTextbox(page, label).click();
    await page.getByRole('option', { name: option, exact: true }).click();
};

const disablePostgresSsl = async (page: Page): Promise<void> => {
    const select = getTextbox(page, 'SSL mode');
    await select.click();
    await select.press('ArrowUp');
    await select.press('ArrowUp');
    await select.press('ArrowUp');
    await select.press('Enter');
    await expect(select).toHaveValue('disable');
};

const openManualProjectForm = async (
    page: Page,
    warehouseName: string,
): Promise<void> => {
    await page.goto('/createProject');
    await page
        .getByRole('button', {
            name: `${warehouseName} ${warehouseName}`,
            exact: true,
        })
        .click();
    await page
        .getByRole('button', {
            name: 'Manually Pull project from git repository',
            exact: true,
        })
        .click();
    await page
        .getByRole('button', { name: 'I’ve defined them!', exact: true })
        .click();
};

const configureDbt = async (page: Page): Promise<void> => {
    await selectOption(page, 'Type', 'dbt local server');
    await getTextbox(page, 'Target name').fill(stagingWarehouse.dbtTarget);
};

const configurePostgresWarehouse = async (
    page: Page,
    config: PostgresWarehouseConfig,
): Promise<void> => {
    await getTextbox(page, 'Host').fill(config.host);
    await getTextbox(page, 'User').fill(config.user);
    await getTextbox(page, 'Password').fill(config.password);
    await getTextbox(page, 'DB name').fill(config.database);

    const warehouseSettings = page
        .getByRole('heading', {
            name: 'Warehouse connection',
            exact: true,
        })
        .locator('..')
        .locator('..')
        .locator('..');
    await warehouseSettings
        .getByRole('button', {
            name: 'Advanced configuration options',
            exact: true,
        })
        .click();
    await getTextbox(page, 'Port').fill(config.port);
    await disablePostgresSsl(page);
    await configureDbt(page);
    await getTextbox(page, 'Schema').fill(config.schema);
};

const configureBigQueryWarehouse = async (
    page: Page,
    config: BigQueryWarehouseConfig,
): Promise<void> => {
    await selectOption(
        page,
        'Authentication Type',
        'Service Account (JSON key file)',
    );
    await getTextbox(page, 'Project').fill(config.project);
    await getTextbox(page, 'Location').fill(config.location);
    await page
        .locator('input[name="warehouse.keyfileContents"]')
        .setInputFiles(config.credentialsPath);
    await configureDbt(page);
    await getTextbox(page, 'Data set').fill(config.dataset);
};

const configureSnowflakeAuthentication = async (
    page: Page,
    authentication: SnowflakeAuthentication,
): Promise<void> => {
    switch (authentication.type) {
        case SnowflakeAuthenticationType.PASSWORD:
            await selectOption(page, 'Authentication Type', 'Password');
            await getTextbox(page, 'Password').fill(authentication.password);
            return;
        case SnowflakeAuthenticationType.PRIVATE_KEY:
            await selectOption(
                page,
                'Authentication Type',
                'Service Account (JSON key file)',
            );
            await page
                .locator('input[name="warehouse.privateKey"]')
                .setInputFiles(authentication.privateKeyPath);
            if (authentication.privateKeyPassphrase !== null) {
                await getTextbox(page, 'Private Key Passphrase').fill(
                    authentication.privateKeyPassphrase,
                );
            }
            return;
        default:
            assertUnreachable(
                authentication,
                'Unknown Snowflake authentication type',
            );
    }
};

const configureSnowflakeWarehouse = async (
    page: Page,
    config: SnowflakeWarehouseConfig,
): Promise<void> => {
    await getTextbox(page, 'Account').fill(config.account);
    await configureSnowflakeAuthentication(page, config.authentication);
    await getTextbox(page, 'User').fill(config.user);
    await getTextbox(page, 'Role').fill(config.role);
    await getTextbox(page, 'Database').fill(config.database);
    await getTextbox(page, 'Warehouse').fill(config.warehouse);
    await configureDbt(page);
    await getTextbox(page, 'Schema').fill(config.schema);
};

const waitForCreateProjectJob = async (
    apiRequest: APIRequestContext,
    jobUuid: string,
): Promise<string> => {
    const observed: { job: ParsedCreateProjectJob | null } = { job: null };

    try {
        await expect
            .poll(
                async () => {
                    const response = await apiRequest.get(
                        `/api/v1/jobs/${jobUuid}`,
                    );
                    if (!response.ok()) {
                        throw new Error(
                            `Create project job request failed with ${response.status()}`,
                        );
                    }
                    observed.job = parseCreateProjectJob(
                        await readJson(response),
                        jobUuid,
                    );
                    return observed.job.state !== 'pending';
                },
                {
                    timeout: COMPILE_JOB_TIMEOUT_MS,
                    intervals: [COMPILE_JOB_POLL_INTERVAL_MS],
                    message: `Create project job ${jobUuid} must finish within 180 seconds`,
                },
            )
            .toBe(true);
    } catch (error: unknown) {
        const lastJob = observed.job;
        const diagnostics =
            lastJob === null ? 'unavailable' : JSON.stringify(lastJob.steps);
        throw new Error(
            `Create project job ${jobUuid} did not finish within 180 seconds. Last steps: ${diagnostics}. Poll error: ${getErrorMessage(error)}`,
        );
    }

    const { job } = observed;
    if (job === null) {
        throw new Error(`Create project job ${jobUuid} returned no status`);
    }

    switch (job.state) {
        case 'done':
            return job.projectUuid;
        case 'error':
            throw new Error(`Compile job failed: ${JSON.stringify(job.steps)}`);
        case 'pending':
            throw new Error(
                `Create project job ${jobUuid} remained pending after polling`,
            );
        default:
            return assertUnreachable(job, 'Unknown create project job state');
    }
};

const submitAndDeployProject = async (
    page: Page,
    apiRequest: APIRequestContext,
    ledger: ProjectLedger,
): Promise<string> => {
    await installDbtProjectDirectoryRoute(page);

    const createButton = page.getByRole('button', {
        name: 'Test & deploy project',
        exact: true,
    });
    await expect(createButton).toBeEnabled();

    activeProject = { ...ledger, creationAttempted: true };
    const [createResponse] = await Promise.all([
        page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
                response.request().method() === 'POST' &&
                url.pathname === '/api/v1/org/projects/precompiled'
            );
        }),
        createButton.click(),
    ]);
    expect(createResponse.ok()).toBe(true);
    const jobUuid = parseCreateJobUuid(await readJson(createResponse));
    activeProject = { ...ledger, jobUuid, creationAttempted: true };
    const projectUuid = await waitForCreateProjectJob(apiRequest, jobUuid);
    activeProject = {
        ...ledger,
        projectUuid,
        jobUuid,
        creationAttempted: true,
    };

    await expect(page).toHaveURL(
        (url) =>
            url.pathname === `/createProjectSettings/${projectUuid}` &&
            url.search === '',
        { timeout: 30_000 },
    );
    await expect(
        page.getByRole('heading', {
            name: /Your project has connected successfully!/,
        }),
    ).toBeVisible();

    const tableConfiguration = page.locator(
        'form[name="project_table_configuration"]',
    );
    await expect(tableConfiguration).toContainText(
        /You have selected \d+ models/,
    );
    const saveButton = tableConfiguration.getByRole('button', {
        name: 'Save changes',
        exact: true,
    });
    await expect(saveButton).toBeEnabled();

    const [configurationResponse] = await Promise.all([
        page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
                response.request().method() === 'PATCH' &&
                url.pathname ===
                    `/api/v1/projects/${projectUuid}/tablesConfiguration`
            );
        }),
        saveButton.click(),
    ]);
    expect(configurationResponse.ok()).toBe(true);

    await expect(page).toHaveURL(
        (url) =>
            url.pathname === `/projects/${projectUuid}/home` &&
            url.search === '',
        { timeout: 30_000 },
    );
    await expect(
        page.getByRole('heading', { name: /^Welcome, David! ⚡️$/ }),
    ).toBeVisible();
    await expect(
        page.getByText('Charts and Dashboards', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('get started by creating some charts', { exact: true }),
    ).toBeVisible();

    return projectUuid;
};

const testFilterStringEscaping = async (
    apiRequest: APIRequestContext,
    projectUuid: string,
): Promise<void> => {
    const response = await apiRequest.post(
        `/api/v1/projects/${projectUuid}/explores/customers/runQuery`,
        {
            data: {
                exploreName: 'customers',
                dimensions: ['customers_first_name'],
                metrics: [],
                filters: {
                    dimensions: {
                        id: quoteFilterGroupUuid,
                        and: [
                            {
                                id: quoteFilterRuleUuid,
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
    await expect(response).toBeOK();
    const row = parseFirstQueryRow(await readJson(response));
    expect(parseQueryResultValue(row, 'customers_first_name').raw).toBe(
        "Quo'te",
    );
};

const testTimeIntervalsResults = async (
    apiRequest: APIRequestContext,
    projectUuid: string,
    expectedValues: TimeIntervalExpectations,
): Promise<void> => {
    const response = await apiRequest.post(
        `/api/v1/projects/${projectUuid}/explores/events/runQuery`,
        {
            data: {
                exploreName: 'events',
                dimensions: Object.keys(expectedValues),
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
    await expect(response).toBeOK();
    const row = parseFirstQueryRow(await readJson(response));

    Object.entries(expectedValues).forEach(([fieldName, expectedValue]) => {
        expect(
            parseQueryResultValue(row, fieldName).formatted.trim(),
            fieldName,
        ).toBe(expectedValue);
    });
};

const listOrganizationProjects = async (
    adminRequest: APIRequestContext,
): Promise<OrganizationProjectIdentity[]> => {
    const response = await adminRequest.get('/api/v1/org/projects');
    if (!response.ok()) {
        throw new Error(
            `Organization project list failed with ${response.status()}`,
        );
    }
    return parseOrganizationProjects(await readJson(response));
};

const deleteExactProjects = async (
    adminRequest: APIRequestContext,
    projectUuids: string[],
): Promise<string[]> =>
    projectUuids.reduce<Promise<string[]>>(
        async (errorsPromise, projectUuid) => {
            const errors = await errorsPromise;
            try {
                const response = await adminRequest.delete(
                    `/api/v1/org/projects/${projectUuid}`,
                );
                if (response.status() === 200 || response.status() === 404) {
                    return errors;
                }
                return [
                    ...errors,
                    `DELETE ${projectUuid} returned ${response.status()}`,
                ];
            } catch (error: unknown) {
                return [
                    ...errors,
                    `DELETE ${projectUuid} failed: ${getErrorMessage(error)}`,
                ];
            }
        },
        Promise.resolve([]),
    );

const verifyExactProjectGetsAbsent = async (
    adminRequest: APIRequestContext,
    projectUuids: string[],
): Promise<string[]> =>
    projectUuids.reduce<Promise<string[]>>(
        async (errorsPromise, projectUuid) => {
            const errors = await errorsPromise;
            try {
                const response = await adminRequest.get(
                    `/api/v1/projects/${projectUuid}`,
                );
                if (response.status() === 404) {
                    return errors;
                }
                return [
                    ...errors,
                    `GET ${projectUuid} returned ${response.status()} after cleanup`,
                ];
            } catch (error: unknown) {
                return [
                    ...errors,
                    `GET ${projectUuid} verification failed: ${getErrorMessage(error)}`,
                ];
            }
        },
        Promise.resolve([]),
    );

const recoverExactProjectUuids = async (
    adminRequest: APIRequestContext,
    ledger: ProjectLedger,
): Promise<string[]> => {
    if (ledger.projectUuid !== null) {
        return [ledger.projectUuid];
    }
    if (!ledger.creationAttempted) {
        return [];
    }

    const findByExactName = async (): Promise<string[]> => {
        const projects = await listOrganizationProjects(adminRequest);
        return projects
            .filter((project) => project.name === ledger.projectName)
            .map((project) => project.projectUuid);
    };

    if (ledger.jobUuid === null) {
        return findByExactName();
    }
    const { jobUuid } = ledger;

    const observed: {
        job: ParsedCreateProjectJob | null;
        jobIsMissing: boolean;
    } = {
        job: null,
        jobIsMissing: false,
    };

    await expect
        .poll(
            async () => {
                const response = await adminRequest.get(
                    `/api/v1/jobs/${jobUuid}`,
                );
                if (response.status() === 404) {
                    observed.jobIsMissing = true;
                    return true;
                }
                if (!response.ok()) {
                    throw new Error(
                        `Cleanup job request failed with ${response.status()}`,
                    );
                }
                observed.job = parseCreateProjectJob(
                    await readJson(response),
                    jobUuid,
                );
                return observed.job.state !== 'pending';
            },
            {
                timeout: POST_COMPILE_AND_CLEANUP_TIMEOUT_MS,
                intervals: [COMPILE_JOB_POLL_INTERVAL_MS],
                message: `Cleanup must observe terminal job ${jobUuid}`,
            },
        )
        .toBe(true);

    if (observed.jobIsMissing) {
        return findByExactName();
    }

    const { job } = observed;
    if (job === null) {
        throw new Error(`Cleanup observed no state for job ${jobUuid}`);
    }

    switch (job.state) {
        case 'done':
            return [job.projectUuid];
        case 'error':
            return findByExactName();
        case 'pending':
            throw new Error(`Cleanup job ${jobUuid} remained pending`);
        default:
            return assertUnreachable(job, 'Unknown cleanup job state');
    }
};

const authenticateBrowserAdmin = async (page: Page): Promise<void> => {
    await page.context().clearCookies();
    const apiRequest = page.context().request;
    const loginResponse = await apiRequest.post('/api/v1/login', {
        data: {
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        },
    });
    if (!loginResponse.ok()) {
        throw new Error(
            `Fresh browser admin login returned ${loginResponse.status()}`,
        );
    }

    const userResponse = await apiRequest.get('/api/v1/user');
    if (!userResponse.ok()) {
        throw new Error(
            `Fresh browser admin validation returned ${userResponse.status()}`,
        );
    }
};

const cleanupCreatedProject = async (
    baseURL: string,
    ledger: ProjectLedger,
): Promise<void> => {
    const cleanupErrors: string[] = [];
    const adminRequest = await playwrightRequest.newContext({ baseURL });

    try {
        const loginResponse = await adminRequest.post('/api/v1/login', {
            data: {
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            },
        });

        if (!loginResponse.ok()) {
            cleanupErrors.push(
                `fresh admin login returned ${loginResponse.status()}`,
            );
        } else {
            let projectUuids: string[] = [];
            try {
                projectUuids = await recoverExactProjectUuids(
                    adminRequest,
                    ledger,
                );
            } catch (error: unknown) {
                cleanupErrors.push(
                    `exact project recovery failed: ${getErrorMessage(error)}`,
                );
            }

            cleanupErrors.push(
                ...(await deleteExactProjects(adminRequest, projectUuids)),
            );
            cleanupErrors.push(
                ...(await verifyExactProjectGetsAbsent(
                    adminRequest,
                    projectUuids,
                )),
            );

            try {
                const remainingProjects =
                    await listOrganizationProjects(adminRequest);
                const remainingUuids = new Set(
                    remainingProjects.map((project) => project.projectUuid),
                );
                projectUuids.forEach((projectUuid) => {
                    if (remainingUuids.has(projectUuid)) {
                        cleanupErrors.push(
                            `Project ${projectUuid} remained in the organization list`,
                        );
                    }
                });
                if (
                    remainingProjects.some(
                        (project) => project.name === ledger.projectName,
                    )
                ) {
                    cleanupErrors.push(
                        `Project name ${ledger.projectName} remained in the organization list`,
                    );
                }
            } catch (error: unknown) {
                cleanupErrors.push(
                    `organization-list verification failed: ${getErrorMessage(error)}`,
                );
            }
        }
    } finally {
        try {
            await adminRequest.dispose();
        } catch (error: unknown) {
            cleanupErrors.push(
                `fresh admin request disposal failed: ${getErrorMessage(error)}`,
            );
        }
    }

    if (cleanupErrors.length > 0) {
        throw new Error(`Project cleanup failed: ${cleanupErrors.join('; ')}`);
    }
};

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Create projects', { tag: '@mutating' }, () => {
    test.describe.configure({
        retries: 0,
        timeout: WAREHOUSE_TEST_TIMEOUT_MS,
    });

    test.beforeEach(async ({ page }) => {
        requireUtc();
        activeProject = null;
        await authenticateBrowserAdmin(page);
    });

    test.afterEach(async ({ baseURL }) => {
        const ledger = activeProject;
        activeProject = null;
        if (ledger === null || !ledger.creationAttempted) {
            return;
        }
        if (baseURL === undefined) {
            throw new Error('PLAYWRIGHT_BASE_URL is required for cleanup');
        }
        await cleanupCreatedProject(baseURL, ledger);
    });

    test('Should create a Postgres project', async ({ page }) => {
        const config = getPostgresWarehouseConfig();
        const ledger = createProjectLedger('Jaffle PostgreSQL test');
        const apiRequest = page.context().request;

        await openManualProjectForm(page, 'PostgreSQL');
        await getTextbox(page, 'Project name').fill(ledger.projectName);
        await configurePostgresWarehouse(page, config);

        const projectUuid = await submitAndDeployProject(
            page,
            apiRequest,
            ledger,
        );
        await testFilterStringEscaping(apiRequest, projectUuid);
        await testTimeIntervalsResults(
            apiRequest,
            projectUuid,
            postgresTimeIntervals,
        );
    });

    test('Should create a Bigquery project', async ({ page }) => {
        const config = getBigQueryWarehouseConfig();
        const ledger = createProjectLedger('Jaffle Bigquery test');
        const apiRequest = page.context().request;

        await openManualProjectForm(page, 'BigQuery');
        await getTextbox(page, 'Project name').fill(ledger.projectName);
        await configureBigQueryWarehouse(page, config);

        const projectUuid = await submitAndDeployProject(
            page,
            apiRequest,
            ledger,
        );
        await testFilterStringEscaping(apiRequest, projectUuid);
        await testTimeIntervalsResults(
            apiRequest,
            projectUuid,
            bigQueryTimeIntervals,
        );
    });

    test('Should create a Snowflake project', async ({ page }) => {
        const config = getSnowflakeWarehouseConfig();
        const ledger = createProjectLedger('Jaffle Snowflake test');
        const apiRequest = page.context().request;

        await openManualProjectForm(page, 'Snowflake');
        await getTextbox(page, 'Project name').fill(ledger.projectName);
        await configureSnowflakeWarehouse(page, config);

        const projectUuid = await submitAndDeployProject(
            page,
            apiRequest,
            ledger,
        );
        await testFilterStringEscaping(apiRequest, projectUuid);
        await testTimeIntervalsResults(
            apiRequest,
            projectUuid,
            snowflakeTimeIntervals,
        );
    });
});
