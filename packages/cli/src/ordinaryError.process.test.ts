import { promises as fs } from 'fs';
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
