const PGHOST = '34.77.111.105';
const PGPASSWORD = 'lightdash-e2e-test-password';
const PGUSER = 'postgres';
const PGDATABASE = 'postgres';
const PGPORT = '5432';

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
    /*
    it('Should be able to create new project from settings', () => {
        cy.visit(`/`);

        cy.findByText("Settings").click()

        cy.findByText("Project management").click()
        cy.findByText("Create new").click()

        cy.url().should('include', '/createProject')

        cy.contains("Connect your project")
    }); */

    it('Should create a Postgres project', () => {
        cy.visit(`/createProject`);

        cy.get('[name="name"]').type('Jaffle PostgreSQL test');

        // Warehouse
        cy.get('select').eq(1).select('PostgreSQL');
        cy.get('[name="warehouse.host"]').type(PGHOST);
        cy.get('[name="warehouse.user"]').type(PGUSER);
        cy.get('[name="warehouse.password"]').type(PGPASSWORD);
        cy.get('[name="warehouse.dbname"]').type(PGDATABASE);

        cy.contains('Show advanced fields').click();

        cy.get('[name="warehouse.port"]').clear().type(PGPORT);
        cy.get('select').eq(2).select('disable'); // SSL mode

        // DBT
        cy.get('select').eq(3).select('dbt local server');
        cy.get('[name="dbt.target"]').type('test');

        cy.get('[name="warehouse.schema"]').type('jaffle');

        // Compile
        cy.findByText('Test and compile project').click();
        cy.contains('Step 1/3', { timeout: 30000 });
        cy.contains('Step 2/3', { timeout: 30000 });
        cy.contains('Successfully synced dbt project!', { timeout: 30000 });

        // Configure
        cy.findByText('Save').click();

        // Open SQL runner
        cy.findByText('Explore').click();
        cy.findByText('SQL Runner').click();

        cy.findByText('payments').click();
        cy.findAllByText('Run query').first().click();
        cy.findAllByText('25 results');
    });
    /* // TODO enable
    it('Should create a Redshift project', () => {
        // https://docs.aws.amazon.com/redshift/latest/dg/c_redshift-and-postgres-sql.html
        // Amazon Redshift is based on PostgreSQL
        // So we can use our own PostgreSQL local instance to test the connection against Redshift

        cy.visit(`/createProject`);

        cy.get('[name="name"]').type('Jaffle Redshift test');

        // Warehouse
        cy.get('select').eq(1).select('Redshift');
        cy.get('[name="warehouse.host"]').type(
            Cypress.env('PGHOST') || 'db-dev',
        );
        cy.get('[name="warehouse.user"]').type(
            Cypress.env('PGUSER') || 'postgres',
        );
        cy.get('[name="warehouse.password"]').type(
            Cypress.env('PGPASSWORD') || 'password',
        );
        cy.get('[name="warehouse.dbname"]').type(
            Cypress.env('PGDATABASE') || 'postgres',
        );

        cy.contains('Show advanced fields').click();

        cy.get('[name="warehouse.port"]')
            .clear()
            .type(Cypress.env('PGPORT') || '5432');
        cy.get('select').eq(2).select('disable'); // SSL mode

        // DBT
        cy.get('select').eq(3).select('dbt local server');
        cy.get('[name="warehouse.schema"]').type('jaffle');

        // Compile
        cy.findByText('Test and compile project').click();
        cy.contains('Step 1/3', { timeout: 60000 });
        cy.contains('Step 2/3', { timeout: 60000 });
        cy.contains('Successfully synced dbt project!', { timeout: 60000 });

        // Configure
        cy.findByText('Save').click();

        // Open SQL runner
        cy.findByText('Explore').click();
        cy.findByText('SQL Runner').click();

        cy.findByText('payments').click();
        cy.findAllByText('Run query').first().click();
        cy.findAllByText('25 results');
    }); */
});
