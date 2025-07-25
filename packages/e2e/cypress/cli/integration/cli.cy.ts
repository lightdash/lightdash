import { SEED_PROJECT } from '@lightdash/common';

const cliCommand = `lightdash`;
const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;

const lightdashUrl = Cypress.config('baseUrl');

const databaseEnvVars = {
    PGHOST: Cypress.env('PGHOST') ?? 'localhost',
    PGPORT: Cypress.env('PGPORT') ?? '5432',
    PGUSER: Cypress.env('PGUSER') ?? 'postgres',
    PGPASSWORD: Cypress.env('PGPASSWORD') ?? 'password',
    PGDATABASE: Cypress.env('PGDATABASE') ?? 'postgres',
    SEED_SCHEMA: Cypress.env('SEED_SCHEMA') ?? 'jaffle',
};

describe('deploy', () => {
    let projectToDelete: string;

    after(() => {
        if (projectToDelete) {
            cy.request({
                url: `api/v1/org/projects/${projectToDelete}`,
                headers: { 'Content-type': 'application/json' },
                method: 'DELETE',
            });
        }
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
                        ...databaseEnvVars,
                    },
                },
            ).then((result) => {
                expect(result.stderr).to.contain('Successfully deployed');
                // Delete project
                const matches = result.stderr.match(/projectUuid=([\w-]*)/);
                const projectUuid = matches?.[1];
                if (!projectUuid) {
                    throw new Error(
                        `Could not find project uuid in success message: ${result.stderr}`,
                    );
                }

                // save project uuid to delete after all tests
                projectToDelete = projectUuid;
            });
        });
    });
});
describe('preview', () => {
    const previewName = `e2e preview ${new Date().getTime()}`;

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
                        LIGHTDASH_PROJECT: SEED_PROJECT.project_uuid,
                        ...databaseEnvVars,
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

describe('validate', () => {
    it('Should test validate', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(
                `${cliCommand} validate --project-dir ${projectDir} --profiles-dir ${profilesDir} --project ${SEED_PROJECT.project_uuid}`,
                {
                    failOnNonZeroExit: false,
                    env: {
                        NODE_ENV: 'development',
                        LIGHTDASH_API_KEY: apiToken,
                        LIGHTDASH_URL: lightdashUrl,
                        ...databaseEnvVars,
                    },
                },
            )
                .its('stderr')
                .should('not.contain', 'Validation failed') // This is an internal backend error, this should not happen
                .should('contain', 'Validation finished'); // It can be without or without validation errors
        });
    });
});
