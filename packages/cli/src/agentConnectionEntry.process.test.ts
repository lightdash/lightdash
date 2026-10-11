import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { agentCommandUnavailable, personalLoginRequired } from './credentials';

let directory: string;
let server: Server;
let instance: string;
let requests: unknown[];
let configPath: string;
let contents: string;
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'cli-entry-'));
    requests = [];
    server = createServer((req, res) => {
        requests.push({ url: req.url, headers: req.headers });
        res.writeHead(500);
        res.end('{}');
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
        throw new Error('No test server address');
    instance = `http://127.0.0.1:${address.port}`;
    configPath = path.join(directory, '.config/lightdash/config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    contents = yaml.dump({
        user: {
            anonymousUuid: 'test',
            userUuid: '11111111-1111-4111-8111-111111111111',
            organizationUuid: '22222222-2222-4222-8222-222222222222',
        },
        context: { serverUrl: instance, apiKey: 'stored-human-key' },
    });
    await fs.writeFile(configPath, contents);
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(directory, { recursive: true, force: true });
});
const runCli = (args: string[], selection: string | null, humanEnv: boolean) =>
    new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: directory,
            LIGHTDASH_URL: instance,
            NO_COLOR: '1',
        };
        delete env.LIGHTDASH_AGENT_CONNECTION;
        delete env.LIGHTDASH_API_KEY;
        if (selection !== null) env.LIGHTDASH_AGENT_CONNECTION = selection;
        if (humanEnv) env.LIGHTDASH_API_KEY = 'env-human-key';
        const child = spawn(
            process.execPath,
            ['--import', 'tsx', path.join(__dirname, 'index.ts'), ...args],
            { env, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        child.stdout.on('data', (data) => {
            output += String(data);
        });
        child.stderr.on('data', (data) => {
            output += String(data);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ code, output });
        });
    });
it('refuses selected login in the real entry point before network or config writes', async () => {
    const result = await runCli(
        ['--agent-connection', 'x', 'login', instance],
        null,
        true,
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(personalLoginRequired);
    expect(requests).toEqual([]);
    expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
}, 30_000);
it('rejects an explicitly empty environment selection in the real entry point', async () => {
    const result = await runCli(['config', 'list-projects'], '', true);
    expect(result.code).toBe(1);
    expect(result.output).toContain(
        'Select a non-empty agent connection slot name',
    );
    expect(requests).toEqual([]);
}, 30_000);
it.each([true, false])(
    'never falls back from a missing slot to human credentials (env=%s)',
    async (humanEnv) => {
        const result = await runCli(
            ['config', 'list-projects'],
            'missing',
            humanEnv,
        );
        expect(result.code).toBe(1);
        expect(result.output).toContain('Agent connection not found');
        expect(result.output).not.toContain(agentCommandUnavailable);
        expect(result.output).not.toContain('env-human-key');
        expect(result.output).not.toContain('stored-human-key');
        expect(requests).toEqual([]);
        expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
    },
    30_000,
);
