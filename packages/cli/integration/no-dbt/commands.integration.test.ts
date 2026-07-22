import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../dist/index.js');
const PROCESS_TIMEOUT_MS = 300_000;
const SITE_URL_INPUT = process.env.SITE_URL ?? 'http://localhost:3000';
const SITE_URL = new URL(SITE_URL_INPUT).origin;

type TemporaryRoot = {
    cwd: string;
    home: string;
};

type PersonalAccessToken = {
    token: string;
    uuid: string;
};

const withTemporaryRoot = async <T>(
    callback: (temporaryRoot: TemporaryRoot) => Promise<T>,
): Promise<T> => {
    const root = await fs.mkdtemp(
        path.join(tmpdir(), 'lightdash-cli-commands-'),
    );
    const temporaryRoot = {
        cwd: path.join(root, 'cwd'),
        home: path.join(root, 'home'),
    };

    await Promise.all([
        fs.mkdir(temporaryRoot.cwd),
        fs.mkdir(temporaryRoot.home),
    ]);

    try {
        return await callback(temporaryRoot);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
};

const runCli = async (
    label: string,
    args: string[],
    temporaryRoot: TemporaryRoot,
): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CLI_PATH, ...args], {
            cwd: temporaryRoot.cwd,
            env: {
                ...process.env,
                CI: 'true',
                FORCE_COLOR: '0',
                HOME: temporaryRoot.home,
                NODE_ENV: 'development',
            },
        });
        let stderr = '';
        let stdout = '';
        let timedOut = false;

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, PROCESS_TIMEOUT_MS);

        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(
                new Error(
                    `${label} failed to start: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                ),
            );
        });
        child.on('close', (exitCode, signal) => {
            clearTimeout(timeout);
            if (timedOut) {
                reject(
                    new Error(
                        `${label} timed out after ${PROCESS_TIMEOUT_MS}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                    ),
                );
                return;
            }
            if (exitCode !== 0) {
                reject(
                    new Error(
                        `${label} exited with code ${exitCode} and signal ${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                    ),
                );
                return;
            }
            resolve({ stderr, stdout });
        });
    });

const request = async (
    pathname: string,
    init: RequestInit,
): Promise<Response> => fetch(new URL(pathname, SITE_URL), init);

const responseText = async (
    response: Response,
    operation: string,
): Promise<string> => {
    const body = await response.text();
    if (!response.ok) {
        throw new Error(
            `${operation} failed with status ${response.status}: ${body}`,
        );
    }
    return body;
};

const getSessionCookie = async (): Promise<string> => {
    const response = await request('/api/v1/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        }),
    });
    await responseText(response, 'Seed admin login');

    const cookies = response.headers.getSetCookie().map((header) => {
        const separator = header.indexOf(';');
        return separator === -1 ? header : header.slice(0, separator);
    });
    if (cookies.length === 0) {
        throw new Error('Seed admin login returned no session cookie');
    }
    return cookies.join('; ');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePersonalAccessToken = (body: string): PersonalAccessToken => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`PAT creation returned invalid JSON: ${message}`);
    }

    if (!isRecord(parsed) || parsed.status !== 'ok') {
        throw new Error('PAT creation returned an unexpected response');
    }
    const { results } = parsed;
    if (
        !isRecord(results) ||
        typeof results.token !== 'string' ||
        typeof results.uuid !== 'string'
    ) {
        throw new Error('PAT creation returned invalid token details');
    }
    return { token: results.token, uuid: results.uuid };
};

const createPersonalAccessToken = async (
    cookie: string,
): Promise<PersonalAccessToken> => {
    const response = await request('/api/v1/user/me/personal-access-tokens', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
        },
        body: JSON.stringify({
            autoGenerated: true,
            description: `cli-commands-${randomUUID()}`,
            expiresAt: null,
        }),
    });
    return parsePersonalAccessToken(
        await responseText(response, 'PAT creation'),
    );
};

const deletePersonalAccessToken = async (
    cookie: string,
    uuid: string,
): Promise<void> => {
    const response = await request(
        `/api/v1/user/me/personal-access-tokens/${uuid}`,
        {
            method: 'DELETE',
            headers: { Cookie: cookie },
        },
    );
    await responseText(response, 'PAT cleanup');
};

describe.sequential('CLI commands', () => {
    test('shows command help', async () => {
        await withTemporaryRoot(async (temporaryRoot) => {
            const result = await runCli(
                'lightdash help',
                ['help'],
                temporaryRoot,
            );

            expect(result.stdout).toContain(
                'Developer tools for dbt and Lightdash.',
            );
        });
    });

    test('logs in with a token and persists the server URL', async () => {
        await withTemporaryRoot(async (temporaryRoot) => {
            const cookie = await getSessionCookie();
            const personalAccessToken = await createPersonalAccessToken(cookie);

            try {
                const result = await runCli(
                    'lightdash login',
                    [
                        'login',
                        SITE_URL_INPUT,
                        '--token',
                        personalAccessToken.token,
                    ],
                    temporaryRoot,
                );
                expect(result.stderr).toContain('Login successful');

                const config = await fs.readFile(
                    path.join(
                        temporaryRoot.home,
                        '.config',
                        'lightdash',
                        'config.yaml',
                    ),
                    'utf8',
                );
                expect(config).toContain(`serverUrl: ${SITE_URL}`);
            } finally {
                await deletePersonalAccessToken(
                    cookie,
                    personalAccessToken.uuid,
                );
            }
        });
    });
});
