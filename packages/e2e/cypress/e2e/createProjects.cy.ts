const warehouseConfig = {
    postgresSQL: {
        host: Cypress.env('PGHOST') || 'host.docker.internal',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'password',
        database: 'postgres',
        port: '5432',
        schema: 'jaffle',
    },
};

const configureWarehouse = (config) => {
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
const testCompile = () => {
    // Compile
    cy.findByText('Test & compile project').click();
    cy.contains('Step 1/3', { timeout: 60000 });
    cy.contains('Step 2/3', { timeout: 60000 });
    cy.contains('Successfully synced dbt project!', { timeout: 30000 });

    cy.contains('selected 6 models');
    // Configure
    cy.findByText('Start exploring!').should('not.be.disabled').click();
    cy.url().should('include', '/home', { timeout: 30000 });
};

const testRunQuery = () => {
    // Open SQL runner
    cy.findByText('Explore').click();
    cy.findByText('SQL Runner').click();

    cy.contains('payments').click();
};

const testQuery = () => {
    cy.findByText('Explore').click();
    cy.findByText('Tables').click();

    cy.contains('Orders').click();
    cy.findByText('First name').click();
    cy.findByText('Unique order count').click();
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

        cy.findByText('Settings').click();

        cy.findByText('Project management').click();
        cy.findByText('Create new').click();

        cy.url().should('include', '/createProject');

        cy.contains('Connect your project');
    });

    it('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.contains('PostgreSQL').click();

        cy.get('[name="name"]').type('Jaffle PostgreSQL test');
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

        cy.contains('Redshift').click();

        cy.get('[name="name"]').type('Jaffle Redshift test');
        configureWarehouse(warehouseConfig.postgresSQL);

        testCompile();
        testQuery();
    });
});
