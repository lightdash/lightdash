import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_PROJECT,
    WarehouseTypes,
} from '@lightdash/common';
import { PostgresWarehouseClient } from '@lightdash/warehouses';
import Ajv, { type ValidateFunction } from 'ajv';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROCESS_TIMEOUT_MS = 300_000;
const LOCAL_SCHEMA_PREFIX = 'jaffle_cli_node_';
const REPOSITORY_ROOT = resolve(__dirname, '../../../..');
const CLI_PATH = resolve(REPOSITORY_ROOT, 'packages/cli/dist/index.js');
const FIXTURE_PATH = resolve(REPOSITORY_ROOT, 'examples/full-jaffle-shop-demo');
const SITE_URL = process.env.SITE_URL ?? 'http://127.0.0.1:3000';

const databaseConfig = {
    host: process.env.PGHOST ?? 'localhost',
    port: process.env.PGPORT ?? '5432',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'password',
    database: process.env.PGDATABASE ?? 'postgres',
};

type PatResponse = {
    status: 'ok';
    results: {
        uuid: string;
        token: string;
    };
};

type ProjectsResponse = {
    status: 'ok';
    results: {
        projectUuid: string;
        name: string;
    }[];
};

type Workspace = {
    root: string;
    home: string;
    cwd: string;
    projectDir: string;
    profilesDir: string;
    targetDir: string;
};

type ProcessResult = {
    exitCode: number | null;
    stdout: string;
    stderr: string;
};

const ajv = new Ajv({ allErrors: true });
const validatePatResponse = ajv.compile<PatResponse>({
    type: 'object',
    properties: {
        status: { const: 'ok', type: 'string' },
        results: {
            type: 'object',
            properties: {
                uuid: { type: 'string' },
                token: { type: 'string' },
            },
            required: ['uuid', 'token'],
            additionalProperties: true,
        },
    },
    required: ['status', 'results'],
    additionalProperties: true,
});
const validateProjectsResponse = ajv.compile<ProjectsResponse>({
    type: 'object',
    properties: {
        status: { const: 'ok', type: 'string' },
        results: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    projectUuid: { type: 'string' },
                    name: { type: 'string' },
                },
                required: ['projectUuid', 'name'],
                additionalProperties: true,
            },
        },
    },
    required: ['status', 'results'],
    additionalProperties: true,
});

const processFailure = (result: ProcessResult) =>
    `exit code: ${String(result.exitCode)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;

const requireExitCode = (result: ProcessResult, allowed: number[]): void => {
    if (result.exitCode === null || !allowed.includes(result.exitCode)) {
        throw new Error(
            `Expected exit code ${allowed.join(' or ')}\n${processFailure(result)}`,
        );
    }
};

const requireStderr = (result: ProcessResult, expected: string): void => {
    if (!result.stderr.includes(expected)) {
        throw new Error(
            `Expected stderr to contain "${expected}"\n${processFailure(result)}`,
        );
    }
};

const rejectStderr = (result: ProcessResult, rejected: string): void => {
    if (result.stderr.includes(rejected)) {
        throw new Error(
            `Expected stderr not to contain "${rejected}"\n${processFailure(result)}`,
        );
    }
};

const runProcess = (
    executable: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
) =>
    new Promise<ProcessResult>((resolvePromise, rejectPromise) => {
        execFile(
            executable,
            args,
            {
                cwd: options.cwd,
                env: options.env,
                encoding: 'utf8',
                timeout: PROCESS_TIMEOUT_MS,
            },
            (error, stdout, stderr) => {
                if (error === null) {
                    resolvePromise({ exitCode: 0, stdout, stderr });
                    return;
                }

                if (error.killed) {
                    rejectPromise(
                        new Error(
                            `Process timed out after ${PROCESS_TIMEOUT_MS}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                        ),
                    );
                    return;
                }

                if (typeof error.code === 'number') {
                    resolvePromise({
                        exitCode: error.code,
                        stdout,
                        stderr,
                    });
                    return;
                }

                rejectPromise(
                    new Error(
                        `Could not execute ${executable}: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
                    ),
                );
            },
        );
    });

const createWorkspace = async (): Promise<Workspace> => {
    const root = await mkdtemp(join(tmpdir(), 'lightdash-cli-integration-'));
    const home = join(root, 'home');
    const cwd = join(root, 'cwd');
    const fixture = join(root, 'fixture');
    const targetDir = join(root, 'target');

    try {
        await Promise.all([
            mkdir(home, { recursive: true }),
            mkdir(cwd, { recursive: true }),
            mkdir(targetDir, { recursive: true }),
            cp(FIXTURE_PATH, fixture, { recursive: true }),
        ]);

        return {
            root,
            home,
            cwd,
            projectDir: join(fixture, 'dbt'),
            profilesDir: join(fixture, 'profiles'),
            targetDir,
        };
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
};

const withWorkspace = async <T>(
    run: (workspace: Workspace) => Promise<T>,
): Promise<T> => {
    const workspace = await createWorkspace();
    try {
        return await run(workspace);
    } finally {
        await rm(workspace.root, { recursive: true, force: true });
    }
};

const validateSchema = (schema: string): string => {
    if (schema.length > 63 || !/^jaffle_cli_node_[a-z0-9_]+$/.test(schema)) {
        throw new Error(
            `SEED_SCHEMA must use the exact ${LOCAL_SCHEMA_PREFIX} prefix and contain only lower-case letters, digits, and underscores`,
        );
    }
    return schema;
};

const getSchema = () =>
    validateSchema(
        process.env.SEED_SCHEMA ??
            `${LOCAL_SCHEMA_PREFIX}${randomUUID().replaceAll('-', '')}`,
    );

const workspaceEnv = (
    workspace: Workspace,
    schema: string,
): NodeJS.ProcessEnv => ({
    ...process.env,
    HOME: workspace.home,
    CI: 'true',
    NODE_ENV: 'development',
    FORCE_COLOR: '0',
    DBT_TARGET_PATH: workspace.targetDir,
    PGHOST: databaseConfig.host,
    PGPORT: databaseConfig.port,
    PGUSER: databaseConfig.user,
    PGPASSWORD: databaseConfig.password,
    PGDATABASE: databaseConfig.database,
    SEED_SCHEMA: schema,
});

const runDbt = (
    command: 'seed' | 'run',
    workspace: Workspace,
    schema: string,
) =>
    runProcess(
        'dbt',
        [
            command,
            '--project-dir',
            workspace.projectDir,
            '--profiles-dir',
            workspace.profilesDir,
            '--target-path',
            workspace.targetDir,
            '--full-refresh',
        ],
        {
            cwd: workspace.cwd,
            env: workspaceEnv(workspace, schema),
        },
    );

const parseResponse = async <T>(
    response: Response,
    validate: ValidateFunction<T>,
): Promise<T> => {
    const text = await response.text();
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `Expected JSON from ${response.url}, received: ${text}`,
            { cause: error },
        );
    }

    if (!validate(body)) {
        throw new Error(
            `Invalid response from ${response.url}: ${ajv.errorsText(validate.errors)}`,
        );
    }
    return body;
};

const apiUrl = (path: string) => new URL(path, SITE_URL);

const assertApiSuccess = async (response: Response): Promise<void> => {
    if (!response.ok) {
        throw new Error(
            `API ${response.url} returned ${response.status}: ${await response.text()}`,
        );
    }
};

const authenticatedRequest = (
    cookie: string,
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body: unknown | null,
) =>
    fetch(apiUrl(path), {
        method,
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
        },
        body: body === null ? undefined : JSON.stringify(body),
        redirect: 'manual',
    });

const login = async (): Promise<string> => {
    const response = await fetch(apiUrl('/api/v1/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        }),
        redirect: 'manual',
    });
    await assertApiSuccess(response);

    const cookie = response.headers
        .getSetCookie()
        .map((header) => {
            const separatorIndex = header.indexOf(';');
            return separatorIndex === -1
                ? header
                : header.slice(0, separatorIndex);
        })
        .join('; ');
    if (cookie.length === 0) {
        throw new Error('Login response did not set a session cookie');
    }
    return cookie;
};

const createPat = async (cookie: string): Promise<PatResponse['results']> => {
    const response = await authenticatedRequest(
        cookie,
        '/api/v1/user/me/personal-access-tokens',
        'POST',
        {
            description: `cli integration ${randomUUID()}`,
            autoGenerated: true,
            expiresAt: null,
        },
    );
    await assertApiSuccess(response);
    return (await parseResponse(response, validatePatResponse)).results;
};

const listProjects = async (
    cookie: string,
): Promise<ProjectsResponse['results']> => {
    const response = await authenticatedRequest(
        cookie,
        '/api/v1/org/projects',
        'GET',
        null,
    );
    await assertApiSuccess(response);
    return (await parseResponse(response, validateProjectsResponse)).results;
};

const deleteProject = async (
    cookie: string,
    projectUuid: string,
): Promise<void> => {
    const response = await authenticatedRequest(
        cookie,
        `/api/v1/org/projects/${projectUuid}`,
        'DELETE',
        null,
    );
    if (response.status !== 404) {
        await assertApiSuccess(response);
    }
};

const cleanupProject = async (
    cookie: string,
    projectUuid: string | null,
    exactName: string,
): Promise<void> => {
    try {
        if (projectUuid !== null) {
            await deleteProject(cookie, projectUuid);
        }
    } finally {
        const remainingMatches = (await listProjects(cookie)).filter(
            (project) => project.name === exactName,
        );
        await Promise.all(
            remainingMatches.map((project) =>
                deleteProject(cookie, project.projectUuid),
            ),
        );
    }
};

const extractProjectUuid = (stderr: string): string | null =>
    stderr.match(
        /projectUuid=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] ?? null;

const dropSchema = async (schema: string): Promise<void> => {
    const port = Number(databaseConfig.port);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(
            `PGPORT must be a positive integer, received ${databaseConfig.port}`,
        );
    }

    const warehouse = new PostgresWarehouseClient({
        type: WarehouseTypes.POSTGRES,
        host: databaseConfig.host,
        port,
        user: databaseConfig.user,
        password: databaseConfig.password,
        dbname: databaseConfig.database,
        schema,
        sslmode: 'disable',
    });
    await warehouse.runQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
};

describe.sequential('CLI backend dbt integration', () => {
    let schema: string | null = null;
    let cookie: string | null = null;
    let pat: PatResponse['results'] | null = null;

    beforeAll(async () => {
        const selectedSchema = getSchema();
        schema = selectedSchema;
        await withWorkspace(async (workspace) => {
            const seedResult = await runDbt('seed', workspace, selectedSchema);
            requireExitCode(seedResult, [0]);

            const runResult = await runDbt('run', workspace, selectedSchema);
            requireExitCode(runResult, [0]);
        });

        const sessionCookie = await login();
        cookie = sessionCookie;
        pat = await createPat(sessionCookie);
    });

    afterAll(async () => {
        try {
            if (cookie !== null && pat !== null) {
                const response = await authenticatedRequest(
                    cookie,
                    `/api/v1/user/me/personal-access-tokens/${pat.uuid}`,
                    'DELETE',
                    null,
                );
                if (response.status !== 404) {
                    await assertApiSuccess(response);
                }
            }
        } finally {
            if (schema !== null) {
                await dropSchema(schema);
            }
        }
    });

    it('creates and deploys a new project', async () => {
        const selectedSchema = schema;
        const sessionCookie = cookie;
        const accessToken = pat;
        if (
            selectedSchema === null ||
            sessionCookie === null ||
            accessToken === null
        ) {
            throw new Error('Suite setup did not complete');
        }

        const projectName = `e2e deploy ${randomUUID()}`;
        let projectUuid: string | null = null;

        try {
            await withWorkspace(async (workspace) => {
                const result = await runProcess(
                    process.execPath,
                    [
                        CLI_PATH,
                        'deploy',
                        '--create',
                        projectName,
                        '--project-dir',
                        workspace.projectDir,
                        '--profiles-dir',
                        workspace.profilesDir,
                        '--target-path',
                        workspace.targetDir,
                    ],
                    {
                        cwd: workspace.cwd,
                        env: {
                            ...workspaceEnv(workspace, selectedSchema),
                            LIGHTDASH_API_KEY: accessToken.token,
                            LIGHTDASH_URL: SITE_URL,
                        },
                    },
                );
                projectUuid = extractProjectUuid(result.stderr);
                requireExitCode(result, [0]);
                requireStderr(result, 'Successfully deployed');
            });
        } finally {
            await cleanupProject(sessionCookie, projectUuid, projectName);
        }
    });

    it('starts and stops a preview project', async () => {
        const selectedSchema = schema;
        const sessionCookie = cookie;
        const accessToken = pat;
        if (
            selectedSchema === null ||
            sessionCookie === null ||
            accessToken === null
        ) {
            throw new Error('Suite setup did not complete');
        }

        const previewName = `e2e preview ${randomUUID()}`;
        let previewUuid: string | null = null;

        await withWorkspace(async (workspace) => {
            try {
                const startResult = await runProcess(
                    process.execPath,
                    [
                        CLI_PATH,
                        'start-preview',
                        '--project-dir',
                        workspace.projectDir,
                        '--profiles-dir',
                        workspace.profilesDir,
                        '--target-path',
                        workspace.targetDir,
                        '--name',
                        previewName,
                    ],
                    {
                        cwd: workspace.cwd,
                        env: {
                            ...workspaceEnv(workspace, selectedSchema),
                            LIGHTDASH_API_KEY: accessToken.token,
                            LIGHTDASH_URL: SITE_URL,
                            LIGHTDASH_PROJECT: SEED_PROJECT.project_uuid,
                        },
                    },
                );
                requireExitCode(startResult, [0]);
                requireStderr(startResult, 'New project created');

                const matches = (await listProjects(sessionCookie)).filter(
                    (project) => project.name === previewName,
                );
                expect(matches).toHaveLength(1);
                const [previewProject] = matches;
                if (previewProject === undefined) {
                    throw new Error(
                        `Could not find preview project named ${previewName}`,
                    );
                }
                previewUuid = previewProject.projectUuid;
            } finally {
                try {
                    const stopResult = await runProcess(
                        process.execPath,
                        [CLI_PATH, 'stop-preview', '--name', previewName],
                        {
                            cwd: workspace.cwd,
                            env: {
                                ...workspaceEnv(workspace, selectedSchema),
                                LIGHTDASH_API_KEY: accessToken.token,
                                LIGHTDASH_URL: SITE_URL,
                            },
                        },
                    );
                    requireExitCode(stopResult, [0]);
                    requireStderr(
                        stopResult,
                        `Successfully deleted preview project named ${previewName}`,
                    );
                } finally {
                    await cleanupProject(
                        sessionCookie,
                        previewUuid,
                        previewName,
                    );
                }
            }
        });
    });

    it('finishes validation without an internal backend failure', async () => {
        const selectedSchema = schema;
        const accessToken = pat;
        if (selectedSchema === null || accessToken === null) {
            throw new Error('Suite setup did not complete');
        }

        await withWorkspace(async (workspace) => {
            const result = await runProcess(
                process.execPath,
                [
                    CLI_PATH,
                    'validate',
                    '--project-dir',
                    workspace.projectDir,
                    '--profiles-dir',
                    workspace.profilesDir,
                    '--project',
                    SEED_PROJECT.project_uuid,
                ],
                {
                    cwd: workspace.cwd,
                    env: {
                        ...workspaceEnv(workspace, selectedSchema),
                        LIGHTDASH_API_KEY: accessToken.token,
                        LIGHTDASH_URL: SITE_URL,
                    },
                },
            );

            requireExitCode(result, [0, 1]);
            rejectStderr(result, 'Validation failed');
            requireStderr(result, 'Validation finished');
        });
    });
});
