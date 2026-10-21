import { promises as fs } from 'fs';
import { createServer } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { runCliProcess } from './testing/cliProcess';

it('preserves main stdout, stderr and exit code for three ordinary command errors', async () => {
    const baseline = JSON.parse(
        await fs.readFile(
            path.join(__dirname, 'ordinaryError.main.json'),
            'utf8',
        ),
    );
    const directory = await fs.mkdtemp(
        path.join(tmpdir(), 'cli-ordinary-errors-'),
    );
    try {
        await Promise.all(
            ['api', 'authorization', 'unexpected'].map(async (kind) => {
                const env = {
                    ...process.env,
                    HOME: directory,
                    CLI_ERROR_CASE: kind,
                    FORCE_COLOR: '0',
                    NO_COLOR: '1',
                };
                for (const name of [
                    'LIGHTDASH_AGENT_CONNECTION',
                    'LIGHTDASH_API_KEY',
                    'LIGHTDASH_URL',
                    'LIGHTDASH_PROXY_AUTHORIZATION',
                ])
                    delete env[name as keyof typeof env];
                const result = await runCliProcess({
                    args: ['config', 'list-projects'],
                    env,
                    preload: path.join(__dirname, 'ordinaryError.fixture.cjs'),
                });
                const normalize = (value: string) =>
                    value
                        .replaceAll(
                            path.resolve(__dirname, '../../..'),
                            '<CHECKOUT>',
                        )
                        .replace(/:\d+:\d+/g, ':LINE:COLUMN');
                expect({
                    ...result,
                    stdout: normalize(result.stdout),
                    stderr: normalize(result.stderr),
                }).toEqual(baseline.outputs[kind]);
            }),
        );
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 60_000);

it('prints the full multi-line 409 message from finalize through the compiled CLI', async () => {
    const message = `This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: no source in this project provides the dbt project analytics.

To fix it, name the source for this deploy:
  lightdash deploy --source <name>
or store it once for this project:
  lightdash config set-source <name>

Sources in this project: Core models, Replica models.
If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.`;
    const requests: string[] = [];
    const server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.writeHead(409, { 'Content-Type': 'application/json' });
        response.end(
            JSON.stringify({
                status: 'error',
                error: {
                    name: 'ConflictError',
                    statusCode: 409,
                    message,
                    data: {},
                },
            }),
        );
    });
    const directory = await fs.mkdtemp(
        path.join(tmpdir(), 'cli-deploy-conflict-'),
    );
    try {
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('No server address');
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: directory,
            CLI_ERROR_CASE: 'deploy-conflict',
            LIGHTDASH_URL: `http://127.0.0.1:${address.port}`,
            LIGHTDASH_API_KEY: 'synthetic-test-pat',
            FORCE_COLOR: '0',
            NO_COLOR: '1',
        };
        for (const name of [
            'LIGHTDASH_AGENT_CONNECTION',
            'LIGHTDASH_PROXY_AUTHORIZATION',
            'LIGHTDASH_DIAGNOSTICS',
        ])
            delete env[name];
        const result = await runCliProcess({
            args: ['config', 'list-projects'],
            env,
            preload: path.join(__dirname, 'ordinaryError.fixture.cjs'),
        });
        expect(requests).toEqual([
            'POST /api/v2/projects/project/deploy/session/finalize',
        ]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(`${message}\n`);
        expect(result.stderr.split(message)).toHaveLength(2);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 60_000);
