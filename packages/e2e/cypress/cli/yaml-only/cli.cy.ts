/**
 * CLI tests for Lightdash YAML-only projects (no dbt required)
 *
 * These tests verify that Lightdash CLI commands work correctly for projects
 * that define models using Lightdash YAML format instead of dbt.
 */

const cliCommand = `lightdash`;
const projectDir = `../../examples/snowflake-template`;

const lightdashUrl = Cypress.config('baseUrl');

describe('CLI YAML-only project', () => {
    describe('compile', () => {
        it('Should compile a YAML-only project without dbt', () => {
            cy.exec(`${cliCommand} compile --project-dir ${projectDir}`, {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                },
            }).then((result) => {
                // Should find and compile the Lightdash YAML models
                expect(result.stderr).to.contain('users');
                expect(result.stderr).to.contain(
                    'Successfully compiled project',
                );
                expect(result.code).to.eq(0);
            });
        });
    });

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

        it('Should deploy a YAML-only project without dbt', () => {
            cy.login();
            cy.getApiToken().then((apiToken) => {
                cy.exec(
                    `${cliCommand} deploy --create "YAML-only e2e test" --project-dir ${projectDir}`,
                    {
                        failOnNonZeroExit: false,
                        env: {
                            CI: true,
                            NODE_ENV: 'development',
                            LIGHTDASH_API_KEY: apiToken,
                            LIGHTDASH_URL: lightdashUrl,
                        },
                    },
                ).then((result) => {
                    // Should successfully deploy without needing dbt
                    expect(result.stderr).to.contain('users');
                    expect(result.stderr).to.contain('Successfully deployed');
                    expect(result.code).to.eq(0);

                    // Extract project UUID for cleanup
                    const matches = result.stderr.match(/projectUuid=([\w-]*)/);
                    const projectUuid = matches?.[1];
                    if (projectUuid) {
                        projectToDelete = projectUuid;
                    }
                });
            });
        });
    });
});
