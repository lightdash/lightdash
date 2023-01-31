const warehouseConfig = {
    postgresSQL: {
        host: Cypress.env('PGHOST') || 'db-dev',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    bigQuery: {
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyFile: 'credentials.json',
    },
    databricks: {
        host: Cypress.env('DATABRICKS_HOST'),
        token: Cypress.env('DATABRICKS_TOKEN'),
        httpPath: Cypress.env('DATABRICKS_PATH'),
        schema: 'jaffle',
    },
    snowflake: {
        account: Cypress.env('SNOWFLAKE_ACCOUNT'),
        user: Cypress.env('SNOWFLAKE_USER'),
        password: Cypress.env('SNOWFLAKE_PASSWORD'),
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
    },
    trino: {
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
    cy.get('[name="warehouse.host"]').type(config.host, { log: false });
    cy.get('[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('[name="warehouse.password"]').type(config.password, { log: false });
    cy.get('[name="warehouse.dbname"]').type(config.database);

    cy.contains('Advanced configuration options').click();

    cy.get('[name="warehouse.port"]').clear().type(config.port);
    cy.get('[name="warehouse.sslmode"]').select('disable'); // SSL mode

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.schema"]').type(config.schema);
};

const configureBigqueryWarehouse = (
    config: typeof warehouseConfig['bigQuery'],
) => {
    cy.get('[name="warehouse.project"]').type(config.project, { log: false });
    cy.get('[name="warehouse.location"]').type(config.location, { log: false });
    cy.get('[type="file"]').attachFile(warehouseConfig.bigQuery.keyFile);

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.dataset"]').type(config.dataset);
};
const configureTrinoWarehouse = (config: typeof warehouseConfig['trino']) => {
    cy.get('[name="warehouse.host"]').type(config.host, { log: false });
    cy.get('[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('[name="warehouse.password"]').type(config.password, { log: false });
    cy.get('[name="warehouse.dbname"]').type(config.database);

    cy.contains('Advanced configuration options').click();

    cy.get('[name="warehouse.port"]').clear().type(config.port);
    cy.get('[name="warehouse.http_scheme"]').select('https');

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.schema"]').type(config.schema);
};

const configureDatabricksWarehouse = (
    config: typeof warehouseConfig['databricks'],
) => {
    cy.get('[name="warehouse.serverHostName"]').type(config.host, {
        log: false,
    });
    cy.get('[name="warehouse.httpPath"]').type(config.httpPath, { log: false });
    cy.get('[name="warehouse.personalAccessToken"]').type(config.token, {
        log: false,
    });

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.database"]').type(config.schema);
};

const configureSnowflakeWarehouse = (
    config: typeof warehouseConfig['snowflake'],
) => {
    cy.get('[name="warehouse.account"]').type(config.account, { log: false });
    cy.get('[name="warehouse.user"]').type(config.user, { log: false });
    cy.get('[name="warehouse.password"]').type(config.password, { log: false });
    cy.get('[name="warehouse.role"]').type(config.role);
    cy.get('[name="warehouse.database"]').type(config.database);
    cy.get('[name="warehouse.warehouse"]').type(config.warehouse);

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.schema"]').type(config.schema);
};

const testCompile = () => {
    // Compile
    cy.findByText('Test & compile project').click();
    cy.contains('Step 1/3', { timeout: 60000 });
    cy.contains('Step 2/3', { timeout: 60000 });
    cy.contains('Successfully synced dbt project!', { timeout: 60000 });

    cy.contains('selected 7 models');
    // Configure
    cy.findByText('Save changes')
        .parent('button')
        .should('not.be.disabled')
        .click();
    cy.url().should('include', '/home', { timeout: 30000 });
    cy.findByText('Welcome, David! ⚡');
    cy.findByText('Shared');
    cy.findByText('Spaces');
    cy.findByText('get started by creating some charts');
    cy.wait(1000);
};

const testRunQuery = () => {
    // Open SQL runner
    cy.contains('New').click();
    cy.findByText('Query using SQL runner').click();
    cy.url().should('include', '/sqlRunner', { timeout: 30000 });

    cy.contains('payments').click();
};

const testQuery = () => {
    cy.contains('New').click();
    cy.findByText('Query from tables').click();
    cy.url().should('include', '/tables', { timeout: 30000 });

    cy.contains('Orders').click();
    cy.findByText('First name').click();
    cy.findByText('Unique order count').click();
};

const testFilterStringEscaping = () => {
    cy.contains('New').click();
    cy.findByText('Query from tables').click();
    cy.url().should('include', '/tables', { timeout: 30000 });
    cy.contains('Customers').click();

    // Load query via url params
    cy.url().then((urlValue) =>
        cy.visit(
            `${urlValue}?create_saved_chart_version=%7B"tableName"%3A"customers"%2C"metricQuery"%3A%7B"dimensions"%3A%5B"customers_first_name"%5D%2C"metrics"%3A%5B%5D%2C"filters"%3A%7B"dimensions"%3A%7B"id"%3A"e0772fb1-9c35-4d58-81c7-8cdb015c2699"%2C"and"%3A%5B%7B"id"%3A"cdae9905-c299-4926-8ccd-d1f6dabeb733"%2C"target"%3A%7B"fieldId"%3A"customers_first_name"%7D%2C"operator"%3A"equals"%2C"values"%3A%5B"Quo%27te"%5D%7D%5D%7D%7D%2C"sorts"%3A%5B%7B"fieldId"%3A"customers_first_name"%2C"descending"%3Afalse%7D%5D%2C"limit"%3A500%2C"tableCalculations"%3A%5B%5D%2C"additionalMetrics"%3A%5B%5D%7D%2C"tableConfig"%3A%7B"columnOrder"%3A%5B"customers_first_name"%5D%7D%2C"chartConfig"%3A%7B"type"%3A"cartesian"%2C"config"%3A%7B"layout"%3A%7B%7D%2C"eChartsConfig"%3A%7B%7D%7D%7D%7D`,
        ),
    );

    // wait for query to finish
    cy.findByText('Loading results', { timeout: 30000 }).should('not.exist');

    // check that first row
    cy.get('table')
        .find('td', { timeout: 10000 })
        .eq(1)
        .should('contain.text', "Quo'te");
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
    '2020-08',
    '8',
    'August',
    '2020-Q3',
    '3',
    'Q3',
    '2020',
    '2,020',
];

const percentileRowValues = ['2020-08-11', '1,298', '828', '1,298', '1,717'];

const testPercentile = (rowValues = percentileRowValues) => {
    cy.contains('New').click();
    cy.findByText('Query from tables').click();
    cy.url().should('include', '/tables', { timeout: 30000 });

    cy.contains('Events').click();
    cy.findByText('Timestamp tz').click();
    cy.findByText('Day').click();

    cy.findByText('Median').click();
    cy.findByText('Percentile 25').click();
    cy.findByText('Percentile 50').click();
    cy.findByText('Percentile 75').click();

    cy.get('th')
        .contains('Timestamp tz day')
        .closest('th')
        .find('button')
        .click();

    // sort `Customers First-Name` by ascending
    cy.findByRole('option', { name: 'Sort New-Old' }).click();

    // wait for query to finish
    cy.findByText('Loading chart', { timeout: 30000 }).should('not.exist');
    cy.findByText('Loading results', { timeout: 30000 }).should('not.exist');

    // check first row values
    rowValues.forEach((value, index) => {
        cy.get('table')
            .find('td', { timeout: 10000 })
            .eq(index + 1)
            .should('contain.text', value);
    });
};
const testTimeIntervalsResults = (rowValues = defaultRowValues) => {
    cy.contains('New').click();
    cy.findByText('Query from tables').click();
    cy.url().should('include', '/tables', { timeout: 30000 });

    cy.contains('Events').click();
    cy.findByText('Timestamp tz').click();

    cy.findByText('Raw').click();
    cy.findByText('Millisecond').click();
    cy.findByText('Second').click();
    cy.findByText('Minute').click();
    cy.findByText('Hour').click();
    cy.findByText('Day').click();
    cy.findByText('Day of the week (index)').click();
    cy.findByText('Day of the week (name)').click();
    cy.findByText('Day of the month (number)').click();
    cy.findByText('Day of the year (number)').click();
    cy.findByText('Week').click();
    cy.findByText('Month').click();
    cy.findByText('Month (number)').click();
    cy.findByText('Month (name)').click();
    cy.findByText('Quarter').click();
    cy.findByText('Quarter (number)').click();
    cy.findByText('Quarter (name)').click();
    cy.findByText('Year').click();
    cy.findByText('Year (number)').click();

    // open column menu
    cy.get('th')
        .contains('Timestamp tz raw')
        .closest('th')
        .find('button')
        .click();

    // sort `Customers First-Name` by ascending
    cy.findByRole('option', { name: 'Sort New-Old' }).click();

    // wait for query to finish
    cy.findByText('Loading chart', { timeout: 30000 }).should('not.exist');
    cy.findByText('Loading results', { timeout: 30000 }).should('not.exist');

    // check first row values
    rowValues.forEach((value, index) => {
        cy.get('table')
            .find('td', { timeout: 10000 })
            .eq(index + 1)
            .should('contain.text', value);
    });
};

describe('Create projects', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should be able to create new project from settings', () => {
        cy.visit(`/`);

        cy.findAllByTestId('settings-menu').click();
        cy.findByRole('menuitem', { name: 'Organization settings' }).click();

        cy.findByText('Project management').click();
        cy.findByText('Create new').click();
        cy.contains('button', 'PostgreSQL').click();

        cy.url().should('include', '/createProject/cli');

        cy.contains('a', 'Create project manually');
    });

    it.only('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.contains('button', 'PostgreSQL').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle PostgreSQL test');
        configurePostgresWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();
        testTimeIntervalsResults();
        testPercentile();
    });
    it('Should create a Redshift project', () => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        cy.visit(`/createProject`);

        cy.contains('button', 'Redshift').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle Redshift test');
        configurePostgresWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();
        testTimeIntervalsResults();
        testPercentile();
    });
    it('Should create a Bigquery project', () => {
        cy.visit(`/createProject`);

        cy.contains('button', 'BigQuery').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle Bigquery test');
        configureBigqueryWarehouse(warehouseConfig.bigQuery);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();

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
            '2020-08',
            '8',
            'August',
            '2020-Q3',
            '3',
            'Q3',
            '2020',
            '2,020',
        ];

        testTimeIntervalsResults(bigqueryRowValues);

        testPercentile();
    });
    it('Should create a Trino project', () => {
        cy.visit(`/createProject`);

        cy.contains('button', 'Trino').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle Trino test');
        configureTrinoWarehouse(warehouseConfig.trino);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();

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
            '2,020',
        ];

        testTimeIntervalsResults(trinoRowValues);
        testPercentile();
    });
    it('Should create a Databricks project', () => {
        cy.visit(`/createProject`);

        cy.contains('button', 'Databricks').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle Databricks test');
        configureDatabricksWarehouse(warehouseConfig.databricks);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();
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
            '2,020',
        ];

        testTimeIntervalsResults(databricksRowValues);
        testPercentile();
    });

    it('Should create a Snowflake project', () => {
        cy.visit(`/createProject`);

        cy.contains('button', 'Snowflake').click();
        cy.contains('a', 'Create project manually').click();
        cy.contains('button', 'I’ve defined them!').click();

        cy.get('[name="name"]').clear().type('Jaffle Snowflake test');
        configureSnowflakeWarehouse(warehouseConfig.snowflake);

        testCompile();
        testQuery();
        testFilterStringEscaping();
        testRunQuery();

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
            '2020-08',
            '8',
            'August',
            '2020-Q3',
            '3',
            'Q3',
            '2020',
            '2,020',
        ];

        testTimeIntervalsResults(snowflakeRowValues);
        testPercentile();
    });
});
