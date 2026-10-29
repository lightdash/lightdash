import {
    expect,
    getApiToken,
    loginAs,
    runCli,
    SEED_USERS,
    test,
} from '../../../support/test';

const cliCommand = `lightdash`;

test.describe('help', () => {
    test('Should test lightdash command help', async () => {
        const result = await runCli(`${cliCommand} help`);
        expect(result.stdout).toContain(
            'Developer tools for dbt and Lightdash.',
        );
    });
});

test.describe('version', () => {
    test('Should get version', async () => {
        const result = await runCli(`${cliCommand} --version`);
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
});

test.describe('login', () => {
    test('Should lightdash login with token', async ({ api }) => {
        const lightdashUrl = test.info().project.use.baseURL;
        await loginAs(api.raw, SEED_USERS.admin);
        const apiToken = await getApiToken(api.raw);
        const result = await runCli(
            `${cliCommand} login ${lightdashUrl} --token ${apiToken}`,
            {
                env: {
                    NODE_ENV: 'development',
                    CI: 'true',
                },
            },
        );
        expect(result.stderr).toContain('Login successful');
    });
});
