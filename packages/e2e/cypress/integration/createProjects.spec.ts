const warehouseConfig = {
    postgresSQL: {
        host: Cypress.env('PGHOST'),
        user: 'postgres',
        password: Cypress.env('PGPASSWORD'),
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
    bigQuery: {
        project: 'lightdash-cloud-beta',
        location: 'e2e-jaffle-shop',
        keyFile: 'credentials.json',
    },
};

const configureWarehouse = (config) => {
    cy.get('[name="warehouse.host"]').type(config.host);
    cy.get('[name="warehouse.user"]').type(config.user);
    cy.get('[name="warehouse.password"]').type(config.password);
    cy.get('[name="warehouse.dbname"]').type(config.database);

    cy.contains('Show advanced fields').click();

    cy.get('[name="warehouse.port"]').clear().type(config.port);
    cy.get('select').eq(2).select('disable'); // SSL mode

    // DBT
    cy.get('select').eq(3).select('dbt local server');
    cy.get('[name="dbt.target"]').type('test');
    cy.get('[name="warehouse.schema"]').type(config.schema);
};
const testCompile = () => {
    // Compile
    cy.findByText('Test and compile project').click();
    cy.contains('Step 1/3', { timeout: 30000 });
    cy.contains('Step 2/3', { timeout: 30000 });
    cy.contains('Successfully synced dbt project!', { timeout: 30000 });

    // Configure
    cy.findByText('Save').click();
};

const testRunQuery = () => {
    // Open SQL runner
    cy.findByText('Explore').click();
    cy.findByText('SQL Runner').click();

    cy.contains('payments').click();
    cy.findAllByText('Run query').first().click();
    cy.findAllByText('25 results');
};

const testQuery = () => {
    cy.findByText('Explore').click();
    cy.findByText('Tables').click();

    cy.findByText('Orders').click();
    cy.findByText('First name').click();
    cy.findByText('Unique order count').click();
    cy.get('th b').first().should('have.text', 'First name').click();
    cy.get('td', { timeout: 10000 }).eq(1).should('have.text', 'Aaron');
};

describe('Dashboard', () => {
    before(() => {
        // @ts-ignore
        cy.login();
        // @ts-ignore
        cy.preCompileProject();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should be able to create new project from settings', () => {
        cy.visit(`/`);

        cy.findByText('Settings').click();

        cy.findByText('Project management').click();
        cy.findByText('Create new').click();

        cy.url().should('include', '/createProject');

        cy.contains('Connect your project');
    });

    it('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.get('[name="name"]').type('Jaffle PostgreSQL test');

        // Warehouse
        cy.get('select').eq(1).select('PostgreSQL');
        configureWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
        testRunQuery();
    });
    it('Should create a Redshift project', () => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        cy.visit(`/createProject`);

        cy.get('[name="name"]').type('Jaffle Redshift test');

        // Warehouse
        cy.get('select').eq(1).select('Redshift');
        configureWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
    });

    it.only('Should create a BigQuery project', () => {
        // This test requires GCP credentials inside /cypress/fixtures
        // This file is copied on github actions: e2e-tests.yml from Github secrets
        // If you run this locally you'll have to copy your own credentials.json file manually
        // This file is gitignored

        cy.visit(`/createProject`);

        cy.get('[name="name"]').type('Jaffle BigQuery test');

        // Warehouse
        cy.get('select').eq(1).select('BigQuery');
        cy.get('[name="warehouse.project"]').type(
            warehouseConfig.bigQuery.project,
        );
        cy.get('[name="warehouse.location"]').type(
            warehouseConfig.bigQuery.location,
        );

        cy.get('[type="file"]').attachFile(warehouseConfig.bigQuery.keyFile);

        //testCompile();
        //testQuery();
    });
});
