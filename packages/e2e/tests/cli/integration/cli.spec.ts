import { SEED_PROJECT } from '@lightdash/common';
import {
    databaseEnvVars,
    deleteProjectsByName,
    expect,
    getApiToken,
    loginAs,
    runCli,
    SEED_USERS,
    test,
    withAdminApi,
} from '../../../support/test';

const cliCommand = `lightdash`;
const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;

const lightdashUrl = () => test.info().project.use.baseURL ?? '';

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

    test('Should create new project', async ({ api }) => {
        test.setTimeout(240_000);
        await loginAs(api.raw, SEED_USERS.admin);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} deploy --create --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                timeout: 180_000,
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl(),
                    ...databaseEnvVars(),
                },
            },
        );
        expect(result.stderr).toContain('Successfully deployed');
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

test.describe.serial('preview', () => {
    const previewName = `e2e preview ${new Date().getTime()}`;

    test.afterAll(async ({ playwright }) => {
        await withAdminApi(playwright, (api) =>
            deleteProjectsByName(api, [previewName]),
        );
    });

    test('Should start-preview', async ({ api }) => {
        test.setTimeout(240_000);
        await loginAs(api.raw, SEED_USERS.admin);
        // A failed attempt may have created the preview before timing out.
        await deleteProjectsByName(api.raw, [previewName]);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} start-preview --project-dir ${projectDir} --profiles-dir ${profilesDir} --name "${previewName}"`,
            {
                timeout: 180_000,
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl(),
                    LIGHTDASH_PROJECT: SEED_PROJECT.project_uuid,
                    ...databaseEnvVars(),
                },
            },
        );
        expect(result.stderr).toContain('New project created');
    });

    test('Should refresh warehouse credentials when re-running start-preview with the same name', async ({
        api,
    }) => {
        test.setTimeout(240_000);
        await loginAs(api.raw, SEED_USERS.admin);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} start-preview --project-dir ${projectDir} --profiles-dir ${profilesDir} --name "${previewName}"`,
            {
                timeout: 180_000,
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl(),
                    LIGHTDASH_PROJECT: SEED_PROJECT.project_uuid,
                    ...databaseEnvVars(),
                },
            },
        );
        expect(result.stderr).toContain('Updating preview project');
        expect(result.stderr).toContain('Warehouse credentials refreshed');
        expect(result.stderr).toContain('Project updated');
    });

    test('Should stop-preview', async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} stop-preview --name "${previewName}"`,
            {
                env: {
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl(),
                },
            },
        );
        expect(result.stderr).toContain(
            `Successfully deleted preview project named ${previewName}`,
        );
    });
});

test.describe('validate', () => {
    test('Should test validate', async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} validate --project-dir ${projectDir} --profiles-dir ${profilesDir} --project ${SEED_PROJECT.project_uuid}`,
            {
                env: {
                    NODE_ENV: 'development',
                    LIGHTDASH_API_KEY: apiToken,
                    LIGHTDASH_URL: lightdashUrl(),
                    ...databaseEnvVars(),
                },
            },
        );
        // This is an internal backend error, this should not happen
        expect(result.stderr).not.toContain('Validation failed');
        // It can be without or without validation errors
        expect(result.stderr).toContain('Validation finished');
    });
});
