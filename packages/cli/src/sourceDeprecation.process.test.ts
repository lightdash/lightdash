import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { runCliProcess } from './testing/cliProcess';

const notice =
    "--source is deprecated and will be ignored in a future release. Lightdash now works out which dbt source a deploy belongs to from your dbt project. You only need it if the deploy is rejected because the source can't be inferred.";
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
    '%s warns once in yellow on stderr and still passes the explicit source to its handler',
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
        expect(result.stderr).toContain(`\u001b[33m${notice}\u001b[39m`);
        expect(result.stderr.split(notice)).toHaveLength(2);
        expect(result.stdout).not.toContain('deprecated');
    },
);

test.each(['deploy', 'preview', 'start-preview'])(
    '%s has no deprecation notice when the flag is omitted',
    async (command) => {
        const result = await run([command]);
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(
            `${JSON.stringify({ command, source: null })}\n`,
        );
        expect(result.stderr).not.toContain(notice);
    },
);

test.each(['deploy', 'preview', 'start-preview'])(
    '%s help marks the source flag deprecated',
    async (command) => {
        const result = await run([command, '--help']);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('(deprecated)');
        expect(result.stdout).toContain('--source <name>');
        expect(result.stderr).not.toContain(notice);
    },
);

test('the unrelated install-skills repository selector keeps its behavior', async () => {
    const result = await run(['install-skills', '--source', 'synthetic/tools']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
        `${JSON.stringify({ command: 'install-skills', source: 'synthetic/tools' })}\n`,
    );
    expect(result.stderr).not.toContain(notice);
});
