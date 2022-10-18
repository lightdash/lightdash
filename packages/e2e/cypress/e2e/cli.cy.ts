const worskpace = Cypress.env('WORKSPACE') || '../../';

const lightdashUrl = Cypress.config('baseUrl');
const projectDir = `${worskpace}examples/full-jaffle-shop-demo/dbt`;
const profilesDir = `${worskpace}examples/full-jaffle-shop-demo/profiles`;
const cliCommand = `lightdash`;

describe('CLI', () => {
    it('Cypress path', () => {
        cy.exec(`pwd`).its('stdout').should('contain', 'bleh');
    });
    it('Cypress dir', () => {
        cy.exec(`ls `).its('stdout').should('contain', 'bleh');
    });
    it('Should test lightdash command help', () => {
        cy.exec(`${cliCommand} help`)
            .its('stdout')
            .should('contain', 'Developer tools for dbt and Lightdash.');
    });
    it('Should lightdash generate', () => {
        cy.exec(
            `${cliCommand} generate  -y --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
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
    it('Should lightdash login with token', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(`${cliCommand} login ${lightdashUrl} --token ${apiToken}`, {
                failOnNonZeroExit: false,
                env: {
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
            const previewName = 'e2e preview';
            cy.exec(
                `${cliCommand} start-preview --project-dir ${projectDir} --profiles-dir ${profilesDir} --name "${previewName}"`,
                {
                    failOnNonZeroExit: false,
                    env: {
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
                .should('contain', 'New project created on');
        });
    });

    it('Should stop-preview', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            const previewName = 'e2e preview';
            cy.exec(`${cliCommand} stop-preview --name "${previewName}"`, {
                failOnNonZeroExit: false,
                env: {
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
