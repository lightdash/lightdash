import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

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
                    TSX_DISABLE_CACHE: '1',
                };
                for (const name of [
                    'LIGHTDASH_AGENT_CONNECTION',
                    'LIGHTDASH_API_KEY',
                    'LIGHTDASH_URL',
                    'LIGHTDASH_PROXY_AUTHORIZATION',
                ])
                    delete env[name as keyof typeof env];
                const result = await new Promise<{
                    stdout: string;
                    stderr: string;
                    code: number | null;
                }>((resolve, reject) => {
                    const child = spawn(
                        process.execPath,
                        [
                            '--require',
                            path.join(__dirname, 'ordinaryError.fixture.cjs'),
                            '--import',
                            'tsx',
                            path.join(__dirname, 'index.ts'),
                            'config',
                            'list-projects',
                        ],
                        { env, stdio: ['ignore', 'pipe', 'pipe'] },
                    );
                    let stdout = '';
                    let stderr = '';
                    child.stdout.on('data', (data) => {
                        stdout += String(data);
                    });
                    child.stderr.on('data', (data) => {
                        stderr += String(data);
                    });
                    child.on('error', reject);
                    child.on('close', (code) =>
                        resolve({ stdout, stderr, code }),
                    );
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
