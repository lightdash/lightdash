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
};

const configurePostgresWarehouse = (config) => {
    cy.get('[name="warehouse.host"]').type(config.host);
    cy.get('[name="warehouse.user"]').type(config.user);
    cy.get('[name="warehouse.password"]').type(config.password);
    cy.get('[name="warehouse.dbname"]').type(config.database);

    cy.contains('Advanced configuration options').click();

    cy.get('[name="warehouse.port"]').clear().type(config.port);
    cy.get('[name="warehouse.sslmode"]').select('disable'); // SSL mode

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.schema"]').type(config.schema);
};

const configureBigqueryWarehouse = (config) => {
    cy.get('[name="warehouse.project"]').type(config.project);
    cy.get('[name="warehouse.location"]').type(config.location);
    cy.get('[type="file"]').attachFile(warehouseConfig.bigQuery.keyFile);

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.dataset"]').type(config.dataset);
};

const configureDatabricksWarehouse = (config) => {
    cy.get('[name="warehouse.serverHostName"]').type(config.host);
    cy.get('[name="warehouse.httpPath"]').type(config.httpPath);
    cy.get('[name="warehouse.personalAccessToken"]').type(config.token);

    // DBT
    cy.get('[name="dbt.type"]').select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.database"]').type(config.schema);
};

const configureSnowflakeWarehouse = (config) => {
    cy.get('[name="warehouse.account"]').type(config.account);
    cy.get('[name="warehouse.user"]').type(config.user);
    cy.get('[name="warehouse.password"]').type(config.password);
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
    cy.findByText('Start exploring!')
        .parent('button')
        .should('not.be.disabled')
        .click();
    cy.url().should('include', '/home', { timeout: 30000 });
    cy.findByText('Welcome, David! ⚡'); // wait for page to load and avoid race conditions
};

const testRunQuery = () => {
    // Open SQL runner
    cy.findByText('Explore').click();
    cy.findByText('SQL Runner').click();
    cy.url().should('include', '/sqlRunner', { timeout: 30000 });

    cy.contains('payments').click();
};

const testQuery = () => {
    cy.findByText('Explore').click();
    cy.findByText('Tables').click();
    cy.url().should('include', '/tables', { timeout: 30000 });

    cy.contains('Orders').click();
    cy.findByText('First name').click();
    cy.findByText('Unique order count').click();
};

const defaultRowValues = [
    '2020-08-11, 00:17:00:000 (+00:00)',
    '2020-08-11, 00:17:00:000 (+00:00)',
    '2020-08-11, 00:17:00 (+00:00)',
    '2020-08-11, 00:17 (+00:00)',
    '2020-08-11, 00 (+00:00)',
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

const testTimeIntervalsResults = (rowValues = defaultRowValues) => {
    cy.findByText('Explore').click();
    cy.findByText('Tables').click();
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

    // run query
    cy.get('button').contains('Run query').click();

    // wait for query to finish
    cy.findByText('Loading chart').should('not.exist');
    cy.findByText('Loading results').should('not.exist');

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

        cy.get('[data-cy="settings-button"]').click();

        cy.findByText('Project management').click();
        cy.findByText('Create new').click();

        cy.url().should('include', '/createProject');

        cy.contains('Connect your project');
    });

    it('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.contains('PostgreSQL').click();

        cy.get('[name="name"]').clear().type('Jaffle PostgreSQL test');
        configurePostgresWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
        testRunQuery();
        testTimeIntervalsResults();
    });
    it('Should create a Redshift project', () => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        cy.visit(`/createProject`);

        cy.contains('Redshift').click();

        cy.get('[name="name"]').clear().type('Jaffle Redshift test');
        configurePostgresWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
        testRunQuery();
        testTimeIntervalsResults();
    });
    it('Should create a Bigquery project', () => {
        cy.visit(`/createProject`);

        cy.contains('BigQuery').click();

        cy.get('[name="name"]').clear().type('Jaffle Bigquery test');
        configureBigqueryWarehouse(warehouseConfig.bigQuery);

        testCompile();
        testQuery();
        testRunQuery();

        const bigqueryRowValues = [
            '2020-08-12, 07:58:00:000 (+00:00)',
            '2020-08-12, 07:58:00:000 (+00:00)',
            '2020-08-12, 07:58:00 (+00:00)',
            '2020-08-12, 07:58 (+00:00)',
            '2020-08-12, 00 (+00:00)',
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
    });
    it('Should create a Databricks project', () => {
        cy.visit(`/createProject`);

        cy.contains('Databricks').click();

        cy.get('[name="name"]').clear().type('Jaffle Databricks test');
        configureDatabricksWarehouse(warehouseConfig.databricks);

        testCompile();
        testQuery();
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
    });

    it('Should create a Snowflake project', () => {
        cy.visit(`/createProject`);

        cy.contains('Snowflake').click();

        cy.get('[name="name"]').clear().type('Jaffle Snowflake test');
        configureSnowflakeWarehouse(warehouseConfig.snowflake);

        testCompile();
        testQuery();
        testRunQuery();

        const snowflakeRowValues = [
            '2020-08-12, 00:03:00:000 (+00:00)',
            '2020-08-12, 00:03:00:000 (+00:00)',
            '2020-08-12, 00:03:00 (+00:00)',
            '2020-08-12, 00:03 (+00:00)',
            '2020-08-12, 00 (+00:00)',
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
    });
});
