/**
 * CLI tests for Lightdash YAML-only projects (no dbt required)
 *
 * These tests verify that Lightdash CLI commands work correctly for projects
 * that define models using Lightdash YAML format instead of dbt.
 */

import { test, expect } from '../../../fixtures';
import { getApiToken } from '../../../helpers';
import { execSync } from 'child_process';

const cliCommand = 'lightdash';
const projectDir = '../../examples/snowflake-template';

const lightdashUrl = process.env.BASE_URL || 'http://localhost:3000';

function exec(
    command: string,
    options: { env?: Record<string, string> } = {},
): { stdout: string; stderr: string; code: number } {
    try {
        const stdout = execSync(command, {
            encoding: 'utf-8',
            env: { ...process.env, ...options.env },
        });
        return { stdout, stderr: '', code: 0 };
    } catch (e: unknown) {
        const error = e as {
            stdout?: string;
            stderr?: string;
            status?: number;
        };
        return {
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? '',
            code: error.status ?? 1,
        };
    }
}

test.describe('CLI YAML-only project', () => {
    test.describe('compile', () => {
        test('Should compile a YAML-only project without dbt', async () => {
            const result = exec(
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

        test.afterAll(async ({ browser }) => {
            if (projectToDelete) {
                const context = await browser.newContext({
                    storageState: 'playwright/.auth/admin.json',
                });
                const page = await context.newPage();
                await page.request.delete(
                    `api/v1/org/projects/${projectToDelete}`,
                    { headers: { 'Content-type': 'application/json' } },
                );
                await context.close();
            }
        });

        test('Should deploy a YAML-only project without dbt', async ({
            adminPage: page,
        }) => {
            const apiToken = await getApiToken(page.request);
            const result = exec(
                `${cliCommand} deploy --create "YAML-only e2e test" --project-dir ${projectDir}`,
                {
                    env: {
                        CI: 'true',
                        NODE_ENV: 'development',
                        LIGHTDASH_API_KEY: apiToken,
                        LIGHTDASH_URL: lightdashUrl,
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
