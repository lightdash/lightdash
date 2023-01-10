const lightdashUrl = Cypress.config('baseUrl');
const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;
const cliCommand = `../../packages/cli/dist/index.js`;

describe('CLI', () => {
    const previewName = `e2e preview ${new Date().getTime()}`;

    it('Should test lightdash command help', () => {
        cy.exec(`${cliCommand} help`)
            .its('stdout')
            .should('contain', 'Developer tools for dbt and Lightdash.');
    });
    it('Should get version', () => {
        cy.exec(`${cliCommand} --version`)
            .its('stdout')
            .should('contain', '0.');
    });

    it('Should run DBT first', () => {
        cy.exec(
            ` dbt run --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    PGHOST: Cypress.env('PGHOST') || 'localhost',
                    PGPORT: 5432,
                    PGUSER: 'postgres',
                    PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                    PGDATABASE: 'postgres',
                },
            },
        )
            .its('stdout')
            .should('contain', 'Completed successfully');
    });

    it('Should lightdash generate', () => {
        cy.exec(
            `${cliCommand} generate  -y --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    PGHOST: Cypress.env('PGHOST') || 'localhost',
                    PGPORT: 5432,
                    PGUSER: 'postgres',
                    PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                    PGDATABASE: 'postgres',
                },
            },
        )
            .its('stderr')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash compile', () => {
        cy.exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    PGHOST: Cypress.env('PGHOST') || 'localhost',
                    PGPORT: 5432,
                    PGUSER: 'postgres',
                    PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                    PGDATABASE: 'postgres',
                },
            },
        )
            .its('stderr')
            .should('contain', 'Successfully compiled project');
    });

    it('Should throw error on lightdash compile', () => {
        cy.exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir} -m orders`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    PGHOST: Cypress.env('PGHOST') || 'localhost',
                    PGPORT: 5432,
                    PGUSER: 'postgres',
                    PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                    PGDATABASE: 'postgres',
                },
            },
        )
            .its('code')
            .should('eq', 1)
            .its('stderr')
            .should('contain', 'Failed to compile project. Found 1 error');
    });

    it('Should lightdash login with token', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(`${cliCommand} login ${lightdashUrl} --token ${apiToken}`, {
                failOnNonZeroExit: false,
                env: {
                    NODE_ENV: 'development',
                    CI: true,
                },
            })
                .its('stderr')
                .should('contain', 'Login successful');
        });
    });

    it('Should create new project', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(
                `${cliCommand} deploy --create --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
                {
                    failOnNonZeroExit: false,
                    env: {
                        CI: true,
                        NODE_ENV: 'development',
                        LIGHTDASH_API_KEY: apiToken,
                        LIGHTDASH_URL: lightdashUrl,
                        PGHOST: Cypress.env('PGHOST') || 'localhost',
                        PGPORT: 5432,
                        PGUSER: 'postgres',
                        PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                        PGDATABASE: 'postgres',
                    },
                },
            )
                .its('stderr')
                .should('contain', 'Successfully deployed');
        });
    });

    it('Should start-preview', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(
                `${cliCommand} start-preview --project-dir ${projectDir} --profiles-dir ${profilesDir} --name "${previewName}"`,
                {
                    failOnNonZeroExit: false,
                    env: {
                        CI: true,
                        NODE_ENV: 'development',
                        LIGHTDASH_API_KEY: apiToken,
                        LIGHTDASH_URL: lightdashUrl,
                        PGHOST: Cypress.env('PGHOST') || 'localhost',
                        PGPORT: 5432,
                        PGUSER: 'postgres',
                        PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
                        PGDATABASE: 'postgres',
                    },
                },
            )
                .its('stderr')
                .should('contain', 'New project created');
        });
    });

    it('Should stop-preview', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(`${cliCommand} stop-preview --name "${previewName}"`, {
                failOnNonZeroExit: false,
                env: {
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl,
                },
            })
                .its('stderr')
                .should(
                    'contain',
                    `Successfully deleted preview project named ${previewName}`,
                );
        });
    });
});
