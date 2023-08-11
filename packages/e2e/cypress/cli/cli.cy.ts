const lightdashUrl = Cypress.config('baseUrl');
const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;
const cliCommand = `lightdash`;

describe('CLI', () => {
    const previewName = `e2e preview ${new Date().getTime()}`;
    let projectToDelete: string;
    const databaseEnvVars = {
        PGHOST: Cypress.env('PGHOST') || 'localhost',
        PGPORT: 5432,
        PGUSER: 'postgres',
        PGPASSWORD: Cypress.env('PGPASSWORD') || 'password',
        PGDATABASE: 'postgres',
        SEED_SCHEMA: Cypress.env('SEED_SCHEMA') || 'jaffle',
    };

    after(() => {
        if (projectToDelete) {
            cy.request({
                url: `api/v1/org/projects/${projectToDelete}`,
                headers: { 'Content-type': 'application/json' },
                method: 'DELETE',
            });
        }
    });

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

    it('Should run dbt first', () => {
        cy.exec(
            ` dbt run --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: databaseEnvVars,
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
                    ...databaseEnvVars,
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
                    ...databaseEnvVars,
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
                    ...databaseEnvVars,
                },
            },
        ).then((result) => {
            expect(result.code).to.eq(1);
            expect(result.stderr).to.contain(
                'Failed to compile project. Found 1 error',
            );
        });
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
