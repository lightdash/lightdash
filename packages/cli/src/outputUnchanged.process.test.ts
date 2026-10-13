import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';

const words = 'postgres_password_dbt_cloud_user_first.last';
const apiKey = 'd40c859a88894eea85b10a390492bdfa';
const proxyAuthorization = 'Bearer 1bd98c387f924de091f6b79cda97125e';
const project = '44444444-4444-4444-8444-444444444444';
const baselinePath = path.join(__dirname, 'outputUnchanged.main.json');
type Output = { stdout: string; stderr: string; code: number | null };
const outputs: Record<string, Output> = {};
let baseline: { revision: string; outputs: Record<string, Output> };

beforeAll(async () => {
    const directory = await fs.mkdtemp(
        path.join(tmpdir(), 'cli-output-unchanged-'),
    );
    const configDirectory = path.join(directory, '.config/lightdash');
    await fs.mkdir(configDirectory, { recursive: true });
    const calls: string[] = [];
    const server = createServer((req, res) => {
        calls.push(req.url!);
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/v1/login') {
            res.statusCode = 401;
            res.end(
                JSON.stringify({ error: { message: `Rejected ${words}` } }),
            );
        } else if (req.url === '/api/v1/user') {
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        userUuid: 'test-user',
                        organizationUuid: 'test-org',
                    },
                }),
            );
        } else if (req.url?.endsWith('/sqlRunner/tables')) {
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        dbt_cloud_user: { 'first.last': { postgres: {} } },
                    },
                }),
            );
        } else if (req.url?.includes('/sqlRunner/fields?')) {
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: { password: 'string' },
                }),
            );
        } else if (req.url?.startsWith('/analytics')) {
            res.end('{}');
        } else {
            res.statusCode = 404;
            res.end('{}');
        }
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('No address');
        const instance = `http://127.0.0.1:${address.port}`;
        const cases = [
            {
                name: 'login',
                args: [
                    'login',
                    instance,
                    '--email',
                    'first.last@company.com',
                    '--non-interactive',
                ],
                credentials: true,
            },
            {
                name: 'config',
                args: ['config', 'get-project'],
                credentials: true,
            },
            {
                name: 'configVerboseAbsent',
                args: ['config', 'get-project', '--verbose'],
                credentials: false,
            },
            {
                name: 'configVerbosePresent',
                args: ['config', 'get-project', '--verbose'],
                credentials: true,
            },
            {
                name: 'catalog',
                args: [
                    'warehouse-catalog',
                    '--json',
                    '--include-fields',
                    '--database',
                    'dbt_cloud_user',
                    '--schema',
                    'first.last',
                    '--table',
                    'postgres',
                ],
                credentials: true,
            },
        ];
        await cases.reduce(async (previous, testCase) => {
            await previous;
            const config = {
                user: { anonymousUuid: 'test' },
                context: {
                    serverUrl: testCase.name.startsWith('config')
                        ? 'http://127.0.0.1:3000'
                        : instance,
                    project,
                    projectName: words,
                    ...(testCase.credentials
                        ? { apiKey, proxyAuthorization }
                        : {}),
                },
            };
            await fs.writeFile(
                path.join(configDirectory, 'config.yaml'),
                yaml.dump(config),
            );
            const env: NodeJS.ProcessEnv = {
                ...process.env,
                HOME: directory,
                DATABASE_URL:
                    'postgres://postgres:password@localhost:5432/analytics',
                HTTPS_PROXY: 'https://dbt_cloud_user@proxy.internal:3128',
                NO_PROXY: 'localhost,127.0.0.1',
                LIGHTDASH_CLI_PASSWORD: 'password',
                CLI_OUTPUT_TEST_SERVER: instance,
                FORCE_COLOR: '0',
                NO_COLOR: '1',
                TSX_DISABLE_CACHE: '1',
                NODE_PATH: [
                    path.resolve(__dirname, '../node_modules'),
                    path.resolve(__dirname, '../../../node_modules'),
                ].join(path.delimiter),
            };
            for (const name of [
                'LIGHTDASH_AGENT_CONNECTION',
                'LIGHTDASH_API_KEY',
                'LIGHTDASH_URL',
                'LIGHTDASH_PROXY_AUTHORIZATION',
                'LIGHTDASH_PROJECT',
                'LIGHTDASH_SOURCE',
            ])
                delete env[name];
            outputs[testCase.name] = await new Promise<Output>(
                (resolve, reject) => {
                    const child = spawn(
                        process.execPath,
                        [
                            '--require',
                            path.join(__dirname, 'outputUnchanged.fixture.cjs'),
                            '--import',
                            require.resolve('tsx'),
                            process.env.CLI_OUTPUT_MAIN_ENTRY ??
                                path.join(__dirname, 'index.ts'),
                            ...testCase.args,
                        ],
                        {
                            cwd: directory,
                            env,
                            stdio: ['ignore', 'pipe', 'pipe'],
                        },
                    );
                    let stdout = '';
                    let stderr = '';
                    const timeout = setTimeout(() => {
                        child.kill('SIGKILL');
                        reject(new Error(`Child timed out: ${testCase.name}`));
                    }, 30_000);
                    child.stdout.on('data', (data) => {
                        stdout += String(data);
                    });
                    child.stderr.on('data', (data) => {
                        stderr += String(data);
                    });
                    child.on('error', reject);
                    child.on('close', (code) => {
                        clearTimeout(timeout);
                        resolve({ stdout, stderr, code });
                    });
                },
            );
        }, Promise.resolve());
        expect(calls).toContain('/api/v1/login');
        expect(calls).toContain(`/api/v1/projects/${project}/sqlRunner/tables`);
        expect(calls.some((url) => url.includes('/sqlRunner/fields?'))).toBe(
            true,
        );
        if (process.env.CLI_OUTPUT_MAIN_ENTRY) {
            expect(outputs.login.code).toBe(1);
            for (const name of [
                'config',
                'configVerboseAbsent',
                'configVerbosePresent',
                'catalog',
            ])
                expect(outputs[name].code).toBe(0);
            await fs.writeFile(
                baselinePath,
                `${JSON.stringify({ revision: process.env.CLI_OUTPUT_MAIN_REVISION, outputs }, null, 2)}\n`,
            );
        }
        baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 120_000);

it('preserves the password sign-in error and email local part through the real entry point', () => {
    expect(outputs.login).toEqual(baseline.outputs.login);
    expect(outputs.login.stderr).toContain(
        `Cannot sign in with email/password: Rejected ${words}`,
    );
    expect(outputs.login.stdout + outputs.login.stderr).not.toContain(
        '[redacted]',
    );
});
it('preserves get-project stdout and its project name byte for byte', () => {
    expect(outputs.config).toEqual(baseline.outputs.config);
    expect(outputs.config.stderr).toContain(`Name: ${words}`);
    expect(outputs.config.stdout + outputs.config.stderr).not.toContain(
        '[redacted]',
    );
});
it('preserves the verbose config JSON byte for byte when credentials are absent', () => {
    expect(outputs.configVerboseAbsent).toEqual(
        baseline.outputs.configVerboseAbsent,
    );
    expect(outputs.configVerboseAbsent.stderr).toContain('> Config: {');
    expect(outputs.configVerboseAbsent.stderr).not.toMatch(
        /apiKey|proxyAuthorization|\[redacted\]/,
    );
});
it('changes only the two present credential fields in verbose get-project', () => {
    const expected = baseline.outputs.configVerbosePresent;
    expect(outputs.configVerbosePresent).toEqual({
        ...expected,
        stderr: process.env.CLI_OUTPUT_MAIN_ENTRY
            ? expected.stderr
            : expected.stderr
                  .replace(apiKey, '[redacted]')
                  .replace(proxyAuthorization, '[redacted]'),
    });
    if (!process.env.CLI_OUTPUT_MAIN_ENTRY)
        expect(
            outputs.configVerbosePresent.stderr.match(/\[redacted\]/g),
        ).toHaveLength(2);
    expect(outputs.configVerbosePresent.stderr).toContain(`Name: ${words}`);
});
it('preserves catalog JSON stdout byte for byte with credential-like database, schema, table and field names', () => {
    expect(outputs.catalog).toEqual(baseline.outputs.catalog);
    expect(outputs.catalog.stdout).toContain('"table": "postgres"');
    expect(outputs.catalog.stdout).toContain('"name": "password"');
    expect(outputs.catalog.stdout).toContain('"database": "dbt_cloud_user"');
    expect(outputs.catalog.stdout).toContain('"schema": "first.last"');
    expect(outputs.catalog.stdout + outputs.catalog.stderr).not.toContain(
        '[redacted]',
    );
});
