import { test, expect } from '../../../fixtures';
import { getApiToken } from '../../../helpers';
import { execSync } from 'child_process';

const cliCommand = 'lightdash';
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

test.describe('help', () => {
    test('Should test lightdash command help', async () => {
        const result = exec(`${cliCommand} help`);
        expect(result.stdout).toContain('Developer tools for dbt and Lightdash.');
    });
});

test.describe('version', () => {
    test('Should get version', async () => {
        const result = exec(`${cliCommand} --version`);
        expect(result.stdout).toContain('0.');
    });
});

test.describe('login', () => {
    test('Should lightdash login with token', async ({ adminPage: page }) => {
        const apiToken = await getApiToken(page.request);
        const result = exec(
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
