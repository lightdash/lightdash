import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { runCliProcess } from './testing/cliProcess';

let directory: string;

beforeAll(async () => {
    directory = await fs.mkdtemp(
        path.join(tmpdir(), 'cli-source-deprecation-'),
    );
});

afterAll(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});

const run = (args: string[]) => {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: directory,
        FORCE_COLOR: '1',
    };
    for (const name of [
        'LIGHTDASH_AGENT_CONNECTION',
        'LIGHTDASH_API_KEY',
        'LIGHTDASH_URL',
        'LIGHTDASH_PROXY_AUTHORIZATION',
        'NO_COLOR',
    ]) {
        delete env[name];
    }
    return runCliProcess({
        args,
        env,
        preload: path.join(__dirname, 'sourceDeprecation.fixture.cjs'),
    });
};

test.each(['deploy', 'preview', 'start-preview'])(
    '%s passes the explicit source to its handler without a deprecation notice',
    async (command) => {
        const result = await run([
            command,
            '--source',
            'Core models',
            '--source',
            'Replica models',
        ]);
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(
            `${JSON.stringify({ command, source: 'Replica models' })}\n`,
        );
        expect(result.stderr).not.toContain('deprecated');
        expect(result.stdout).not.toContain('deprecated');
    },
);

test.each(['deploy', 'preview', 'start-preview'])(
    '%s has no notice when the flag is omitted',
    async (command) => {
        const result = await run([command]);
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(
            `${JSON.stringify({ command, source: null })}\n`,
        );
        expect(result.stderr).not.toContain('deprecated');
    },
);

test.each(['deploy', 'preview', 'start-preview'])(
    '%s help describes the source flag and when to use it',
    async (command) => {
        const result = await run([command, '--help']);
        expect(result.code).toBe(0);
        const help = result.stdout.replace(/\s+/g, ' ');
        expect(help).toContain('--source <name>');
        expect(help).toContain('several sources provide the same dbt project');
        expect(help).not.toContain('(deprecated) The dbt source');
        expect(result.stderr).not.toContain('deprecated');
    },
);

test('the unrelated install-skills repository selector keeps its behavior', async () => {
    const result = await run(['install-skills', '--source', 'synthetic/tools']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
        `${JSON.stringify({ command: 'install-skills', source: 'synthetic/tools' })}\n`,
    );
    expect(result.stderr).not.toContain('deprecated');
});
