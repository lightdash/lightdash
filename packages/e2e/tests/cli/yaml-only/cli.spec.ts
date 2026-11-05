/**
 * CLI tests for Lightdash YAML-only projects (no dbt required)
 *
 * These tests verify that Lightdash CLI commands work correctly for projects
 * that define models using Lightdash YAML format instead of dbt.
 */
import {
    expect,
    getApiToken,
    loginAs,
    runCli,
    SEED_USERS,
    test,
    withAdminApi,
} from '../../../support/test';

const cliCommand = `lightdash`;
const projectDir = `../../examples/snowflake-template`;

test.describe('CLI YAML-only project', () => {
    test.describe('compile', () => {
        test('Should compile a YAML-only project without dbt', async () => {
            const result = await runCli(
                `${cliCommand} compile --project-dir ${projectDir}`,
                {
                    env: {
                        CI: 'true',
                        NODE_ENV: 'development',
                    },
                },
            );
            // Should find and compile the Lightdash YAML models
            expect(result.stderr).toContain('users');
            expect(result.stderr).toContain('Successfully compiled project');
            expect(result.code).toBe(0);
        });
    });

    test.describe('deploy', () => {
        let projectToDelete: string | undefined;

        test.afterAll(async ({ playwright }) => {
            const projectUuid = projectToDelete;
            if (projectUuid) {
                await withAdminApi(playwright, (api) =>
                    api.delete(`/api/v1/org/projects/${projectUuid}`),
                );
            }
        });

        test('Should deploy a YAML-only project without dbt', async ({
            api,
        }) => {
            await loginAs(api.raw, SEED_USERS.admin);
            const apiToken = await getApiToken(api.raw);
            const result = await runCli(
                `${cliCommand} deploy --create "YAML-only e2e test" --project-dir ${projectDir}`,
                {
                    env: {
                        CI: 'true',
                        NODE_ENV: 'development',
                        LIGHTDASH_API_KEY: apiToken,
                        LIGHTDASH_URL: test.info().project.use.baseURL ?? '',
                    },
                },
            );
            // Should successfully deploy without needing dbt
            expect(result.stderr).toContain('users');
            expect(result.stderr).toContain('Successfully deployed');
            expect(result.code).toBe(0);

            // Extract project UUID for cleanup
            const matches = result.stderr.match(/projectUuid=([\w-]*)/);
            const projectUuid = matches?.[1];
            if (projectUuid) {
                projectToDelete = projectUuid;
            }
        });
    });
});
