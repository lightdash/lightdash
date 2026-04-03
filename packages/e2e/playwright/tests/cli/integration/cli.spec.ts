import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../../fixtures';
import { getApiToken } from '../../../helpers';
import { execSync } from 'child_process';

const cliCommand = 'lightdash';
const projectDir = '../../examples/full-jaffle-shop-demo/dbt';
const profilesDir = '../../examples/full-jaffle-shop-demo/profiles';

const lightdashUrl = process.env.BASE_URL || 'http://localhost:3000';

const databaseEnvVars: Record<string, string> = {
    PGHOST: process.env.PGHOST ?? 'localhost',
    PGPORT: process.env.PGPORT ?? '5432',
    PGUSER: process.env.PGUSER ?? 'postgres',
    PGPASSWORD: process.env.PGPASSWORD ?? 'password',
    PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    SEED_SCHEMA: process.env.SEED_SCHEMA ?? 'jaffle',
};

function exec(
    command: string,
    options: { env?: Record<string, string>; timeout?: number } = {},
): { stdout: string; stderr: string; code: number } {
    try {
        const stdout = execSync(command, {
            encoding: 'utf-8',
            env: { ...process.env, ...options.env },
            timeout: options.timeout,
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

    test('Should create new project', async ({ adminPage: page }) => {
        const apiToken = await getApiToken(page.request);
        const result = exec(
            `${cliCommand} deploy --create --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl,
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Successfully deployed');
        // Extract project UUID for cleanup
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

test.describe('preview', () => {
    const previewName = `e2e preview ${new Date().getTime()}`;

    test('Should start-preview', async ({ adminPage: page }) => {
        const apiToken = await getApiToken(page.request);
        const result = exec(
            `${cliCommand} start-preview --project-dir ${projectDir} --profiles-dir ${profilesDir} --name "${previewName}"`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl,
                    LIGHTDASH_PROJECT: SEED_PROJECT.project_uuid,
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('New project created');
    });

    test('Should stop-preview', async ({ adminPage: page }) => {
        const apiToken = await getApiToken(page.request);
        const result = exec(
            `${cliCommand} stop-preview --name "${previewName}"`,
            {
                env: {
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl,
                },
            },
        );
        expect(result.stderr).toContain(
            `Successfully deleted preview project named ${previewName}`,
        );
    });
});

test.describe('validate', () => {
    test('Should test validate', async ({ adminPage: page }) => {
        const apiToken = await getApiToken(page.request);
        const result = exec(
            `${cliCommand} validate --project-dir ${projectDir} --profiles-dir ${profilesDir} --project ${SEED_PROJECT.project_uuid}`,
            {
                env: {
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl,
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).not.toContain('Validation failed'); // This is an internal backend error, this should not happen
        expect(result.stderr).toContain('Validation finished'); // It can be with or without validation errors
    });
});
