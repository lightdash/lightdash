import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../../dist/index.js');
const FIXTURE_PATH = resolve(
    __dirname,
    '../../../../examples/snowflake-template',
);
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000';
const PROCESS_TIMEOUT_MS = 120_000;
const UUID_PATTERN =
    /projectUuid=([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\b/i;

type TemporaryProject = {
    cwd: string;
    home: string;
    projectDir: string;
};

type CliResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
};

type PersonalAccessToken = {
    token: string;
    uuid: string;
};

const formatError = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const withTemporaryProject = async <T>(
    callback: (temporaryProject: TemporaryProject) => Promise<T>,
): Promise<T> => {
    const root = await mkdtemp(join(tmpdir(), 'lightdash-cli-yaml-only-'));
    const temporaryProject = {
        cwd: join(root, 'cwd'),
        home: join(root, 'home'),
        projectDir: join(root, 'cwd', 'snowflake-template'),
    };
    let outcome:
        | { status: 'success'; value: T }
        | { status: 'failure'; error: unknown };

    try {
        await Promise.all([
            mkdir(temporaryProject.cwd),
            mkdir(temporaryProject.home),
        ]);
        await cp(FIXTURE_PATH, temporaryProject.projectDir, {
            recursive: true,
        });
        outcome = {
            status: 'success',
            value: await callback(temporaryProject),
        };
    } catch (error) {
        outcome = { status: 'failure', error };
    }

    let cleanupError: unknown = null;
    try {
        await rm(root, { recursive: true, force: true });
    } catch (error) {
        cleanupError = error;
    }

    if (outcome.status === 'failure') {
        if (cleanupError !== null) {
            console.error(
                `Temporary workspace cleanup failed: ${formatError(cleanupError)}`,
            );
        }
        throw outcome.error;
    }
    if (cleanupError !== null) throw cleanupError;
    return outcome.value;
};

const runCli = (
    args: string[],
    temporaryProject: TemporaryProject,
    environment: Record<string, string> = {},
): Promise<CliResult> =>
    new Promise((resolveResult, rejectResult) => {
        const child = spawn(process.execPath, [CLI_PATH, ...args], {
            cwd: temporaryProject.cwd,
            env: {
                ...process.env,
                HOME: temporaryProject.home,
                CI: 'true',
                NODE_ENV: 'development',
                FORCE_COLOR: '0',
                ...environment,
            },
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, PROCESS_TIMEOUT_MS);

        child.once('error', (error) => {
            clearTimeout(timeout);
            rejectResult(
                new Error(
                    `CLI process failed to start: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                ),
            );
        });
        child.once('close', (exitCode, signal) => {
            clearTimeout(timeout);
            if (timedOut) {
                rejectResult(
                    new Error(
                        `CLI process timed out after ${PROCESS_TIMEOUT_MS}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                    ),
                );
                return;
            }
            if (exitCode === null) {
                rejectResult(
                    new Error(
                        `CLI process exited from signal ${signal ?? 'unknown'}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                    ),
                );
                return;
            }
            resolveResult({ exitCode, stdout, stderr });
        });
    });

const requireCliResult = (result: CliResult, stderrMarkers: string[]) => {
    const missingMarkers = stderrMarkers.filter(
        (marker) => !result.stderr.includes(marker),
    );
    if (result.exitCode !== 0 || missingMarkers.length > 0) {
        throw new Error(
            `CLI result did not meet expectations. Missing stderr markers: ${missingMarkers.join(', ') || 'none'}\nexit code: ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
    }
};

const request = (pathname: string, init: RequestInit): Promise<Response> =>
    fetch(new URL(pathname, SITE_URL), init);

const responseText = async (
    response: Response,
    operation: string,
): Promise<string> => {
    const body = await response.text();
    if (response.status !== 200) {
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

const parseJson = (body: string, operation: string): unknown => {
    try {
        const parsed: unknown = JSON.parse(body);
        return parsed;
    } catch (error) {
        throw new Error(
            `${operation} returned invalid JSON: ${formatError(error)}`,
        );
    }
};

const parseResults = (body: string, operation: string): unknown[] => {
    const parsed = parseJson(body, operation);
    if (
        !isRecord(parsed) ||
        parsed.status !== 'ok' ||
        !Array.isArray(parsed.results)
    ) {
        throw new Error(`${operation} returned an unexpected response`);
    }
    return parsed.results;
};

const createPersonalAccessToken = async (
    cookie: string,
    description: string,
): Promise<PersonalAccessToken> => {
    const response = await request('/api/v1/user/me/personal-access-tokens', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
        },
        body: JSON.stringify({
            autoGenerated: true,
            description,
            expiresAt: null,
        }),
    });
    const parsed = parseJson(
        await responseText(response, 'PAT creation'),
        'PAT creation',
    );
    if (
        !isRecord(parsed) ||
        parsed.status !== 'ok' ||
        !isRecord(parsed.results) ||
        typeof parsed.results.token !== 'string' ||
        typeof parsed.results.uuid !== 'string'
    ) {
        throw new Error('PAT creation returned invalid token details');
    }
    return { token: parsed.results.token, uuid: parsed.results.uuid };
};

const deleteProject = async (
    cookie: string,
    projectUuid: string,
): Promise<void> => {
    const response = await request(`/api/v1/org/projects/${projectUuid}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
    });
    await responseText(response, `Project cleanup ${projectUuid}`);
};

const findProjectUuids = async (
    cookie: string,
    projectName: string,
): Promise<string[]> => {
    const response = await request('/api/v1/org/projects', {
        method: 'GET',
        headers: { Cookie: cookie },
    });
    const results = parseResults(
        await responseText(response, 'Project cleanup lookup'),
        'Project cleanup lookup',
    );

    return results.flatMap((project) => {
        if (
            !isRecord(project) ||
            typeof project.name !== 'string' ||
            typeof project.projectUuid !== 'string'
        ) {
            throw new Error('Project cleanup lookup returned invalid details');
        }
        return project.name === projectName ? [project.projectUuid] : [];
    });
};

const cleanupProject = async (
    cookie: string,
    projectUuid: string | null,
    projectName: string,
): Promise<void> => {
    const projectUuids =
        projectUuid === null
            ? await findProjectUuids(cookie, projectName)
            : [projectUuid];
    await Promise.all(projectUuids.map((uuid) => deleteProject(cookie, uuid)));
};

const deletePersonalAccessToken = async (
    cookie: string,
    personalAccessTokenUuid: string,
): Promise<void> => {
    const response = await request(
        `/api/v1/user/me/personal-access-tokens/${personalAccessTokenUuid}`,
        {
            method: 'DELETE',
            headers: { Cookie: cookie },
        },
    );
    await responseText(response, `PAT cleanup ${personalAccessTokenUuid}`);
};

const findPersonalAccessTokenUuids = async (
    cookie: string,
    description: string,
): Promise<string[]> => {
    const response = await request('/api/v1/user/me/personal-access-tokens', {
        method: 'GET',
        headers: { Cookie: cookie },
    });
    const results = parseResults(
        await responseText(response, 'PAT cleanup lookup'),
        'PAT cleanup lookup',
    );

    return results.flatMap((token) => {
        if (
            !isRecord(token) ||
            typeof token.description !== 'string' ||
            typeof token.uuid !== 'string'
        ) {
            throw new Error('PAT cleanup lookup returned invalid details');
        }
        return token.description === description ? [token.uuid] : [];
    });
};

const cleanupPersonalAccessToken = async (
    cookie: string,
    personalAccessTokenUuid: string | null,
    description: string,
): Promise<void> => {
    const personalAccessTokenUuids =
        personalAccessTokenUuid === null
            ? await findPersonalAccessTokenUuids(cookie, description)
            : [personalAccessTokenUuid];
    await Promise.all(
        personalAccessTokenUuids.map((uuid) =>
            deletePersonalAccessToken(cookie, uuid),
        ),
    );
};

describe.sequential('CLI YAML-only project', () => {
    test('compiles a YAML-only project without dbt', async () => {
        await withTemporaryProject(async (temporaryProject) => {
            const result = await runCli(
                ['compile', '--project-dir', temporaryProject.projectDir],
                temporaryProject,
            );
            requireCliResult(result, [
                'users',
                'Successfully compiled project',
            ]);
        });
    });

    test('deploys a YAML-only project without dbt', async () => {
        await withTemporaryProject(async (temporaryProject) => {
            const cookie = await getSessionCookie();
            const projectName = `YAML-only CLI ${randomUUID()}`;
            const tokenDescription = `yaml-only-cli-${randomUUID()}`;
            let personalAccessTokenUuid: string | null = null;
            let projectUuid: string | null = null;
            let tokenCreationStarted = false;
            let deployStarted = false;
            let testFailure: { error: unknown } | null = null;

            try {
                tokenCreationStarted = true;
                const personalAccessToken = await createPersonalAccessToken(
                    cookie,
                    tokenDescription,
                );
                personalAccessTokenUuid = personalAccessToken.uuid;
                deployStarted = true;

                const result = await runCli(
                    [
                        'deploy',
                        '--create',
                        projectName,
                        '--project-dir',
                        temporaryProject.projectDir,
                    ],
                    temporaryProject,
                    {
                        LIGHTDASH_API_KEY: personalAccessToken.token,
                        LIGHTDASH_URL: SITE_URL,
                    },
                );
                const matchedProjectUuid =
                    result.stderr.match(UUID_PATTERN)?.[1];
                if (matchedProjectUuid === undefined) {
                    throw new Error(
                        `CLI output did not contain a canonical project UUID\nexit code: ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
                    );
                }
                projectUuid = matchedProjectUuid;
                requireCliResult(result, ['users', 'Successfully deployed']);
            } catch (error) {
                testFailure = { error };
            }

            const [projectCleanup, tokenCleanup] = await Promise.allSettled([
                deployStarted
                    ? cleanupProject(cookie, projectUuid, projectName)
                    : Promise.resolve(),
                tokenCreationStarted
                    ? cleanupPersonalAccessToken(
                          cookie,
                          personalAccessTokenUuid,
                          tokenDescription,
                      )
                    : Promise.resolve(),
            ]);
            const cleanupErrors: unknown[] = [];
            const cleanupMessages: string[] = [];

            if (projectCleanup.status === 'rejected') {
                cleanupErrors.push(projectCleanup.reason);
                cleanupMessages.push(
                    `Project cleanup failed: ${formatError(projectCleanup.reason)}`,
                );
            }
            if (tokenCleanup.status === 'rejected') {
                cleanupErrors.push(tokenCleanup.reason);
                cleanupMessages.push(
                    `PAT cleanup failed: ${formatError(tokenCleanup.reason)}`,
                );
            }

            if (testFailure !== null) {
                cleanupMessages.forEach((message) => console.error(message));
                throw testFailure.error;
            }
            if (cleanupErrors.length > 0) {
                throw new AggregateError(
                    cleanupErrors,
                    cleanupMessages.join('\n'),
                );
            }
        });
    });
});
