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
const runCli = (
    args: string[],
    selection: string | null,
    humanEnv: boolean,
    entry = path.join(__dirname, 'index.ts'),
) =>
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
            ['--import', 'tsx', entry, ...args],
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

it('reports a missing revoke slot without sending a request', async () => {
    const result = await runCli(
        ['agent', 'revoke', '--name', 'x', '--json'],
        null,
        true,
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.output)).toMatchObject({
        version: 1,
        slot: 'x',
        confirmed: false,
        localRemoved: false,
    });
    expect(requests).toEqual([]);
    expect(await fs.readdir(path.dirname(configPath))).toEqual(['config.yaml']);
}, 30_000);
it.each([
    ['--help'],
    ['agent', '--help'],
    ['agent', 'status', '--help'],
    ['agent', 'connect', '--help'],
])(
    'keeps the ordinary help bytes for %j',
    async (...args) => {
        const current = await runCli(args, null, false);
        expect(current.code).toBe(0);
        expect(current.output).toMatchSnapshot();
        expect(requests).toEqual([]);
    },
    30_000,
);

it.each([false, true])(
    'reports missing connection status as a single JSON object (global=%s)',
    async (global) => {
        const args = global
            ? ['agent', 'status', '--json']
            : ['agent', 'status', '--name', 'missing', '--json'];
        const result = await runCli(args, global ? 'missing' : null, true);
        expect(result.code).toBe(1);
        expect(JSON.parse(result.output)).toMatchObject({
            version: 1,
            slot: 'missing',
            connectionState: 'missing',
            checkedAt: null,
            source: 'local',
        });
        expect(requests).toEqual([]);
        expect(await fs.readdir(path.dirname(configPath))).toEqual([
            'config.yaml',
        ]);
    },
    30_000,
);

it('resets the entry JSON footer state before a later ordinary invocation', async () => {
    const source = await fs.readFile(path.join(__dirname, 'index.ts'), 'utf8');
    const tail =
        'program.parseAsync().then(successHandler).catch(errorHandler);';
    expect(source).toContain(tail);
    const entry = path.join(__dirname, `.entry-reuse-${process.pid}.ts`);
    try {
        await fs.writeFile(
            entry,
            source.replace(
                tail,
                `
            void (async () => {
                await program.parseAsync(['agent', 'status', '--name', 'missing', '--json'], { from: 'user' });
                if (!agentConnectionJson) throw new Error('Expected connection JSON mode');
                const ordinaryOptions: boolean[] = [];
                configProgram.commands.find((command) => command.name() === 'get-project')!
                    .action((options) => { ordinaryOptions.push(options.verbose); });
                await program.parseAsync(['config', 'get-project', '--verbose'], { from: 'user' });
                await program.parseAsync(['config', 'get-project'], { from: 'user' });
                if (JSON.stringify(ordinaryOptions) !== '[true,true]') throw new Error('Existing option retention changed');
                process.exitCode = 0;
                successHandler();
            })().catch(errorHandler);
        `,
            ),
        );
        const result = await runCli([], null, false, entry);
        expect(result.code).toBe(0);
        expect(result.output).toContain('Done 🕶');
        expect(requests).toEqual([]);
    } finally {
        await fs.rm(entry, { force: true });
    }
}, 30_000);

it.each([
    [],
    ['--project', '33333333-3333-4333-8333-333333333333'],
    ['--oauth-port', '4321'],
    ['--timeout', '60'],
    ['--verbose'],
])(
    'keeps ordinary connect requests and files for %j',
    async (...flags) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            requests.push({
                method: req.method,
                url: req.url,
                authorization: req.headers.authorization,
            });
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: { refusal: null, identity: 'connected_person' },
                }),
            );
        });
        contents = yaml.dump({
            user: { anonymousUuid: 'test' },
            context: {
                serverUrl: instance,
                apiKey: 'stored-human-key',
                project: '33333333-3333-4333-8333-333333333333',
            },
        });
        await fs.writeFile(configPath, contents);
        const entry = path.join(
            __dirname,
            `.entry-connect-pin-${process.pid}.ts`,
        );
        const source = await fs.readFile(
            path.join(__dirname, 'index.ts'),
            'utf8',
        );
        await fs.writeFile(
            entry,
            `import { promises as fixtureFs } from 'fs';
const originalReadFile = fixtureFs.readFile;
fixtureFs.readFile = function (...args) {
    if (String(args[0]).includes('agent-connections')) throw new Error('Unexpected agent store read');
    return Reflect.apply(originalReadFile, this, args);
};
${source.replace(/^#![^\n]*\n/, '')}`,
        );
        try {
            const result = await runCli(
                ['agent', 'connect', ...flags],
                null,
                false,
                entry,
            );
            expect(result.code).toBe(0);
            expect(result.output).toContain('Agent already connected');
            expect(requests).toEqual([
                {
                    method: 'GET',
                    url: '/api/v2/projects/33333333-3333-4333-8333-333333333333/ai-access/me',
                    authorization: 'ApiKey stored-human-key',
                },
            ]);
            expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
            expect(await fs.readdir(path.dirname(configPath))).toEqual([
                'config.yaml',
            ]);
        } finally {
            await fs.rm(entry, { force: true });
        }
    },
    30_000,
);

const serveUnavailableConnection = () => {
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
        requests.push({ method: req.method, url: req.url });
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/v1/user')
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        userUuid: '11111111-1111-4111-8111-111111111111',
                        organizationUuid:
                            '22222222-2222-4222-8222-222222222222',
                    },
                }),
            );
        else if (req.url?.endsWith('/ai-access/me'))
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: { refusal: null, identity: 'connected_person' },
                }),
            );
        else {
            res.writeHead(404);
            res.end('<html>missing</html>');
        }
    });
};
it('exits 1 on the unavailable request route and leaves only personal config', async () => {
    serveUnavailableConnection();
    const result = await runCli(
        ['agent', 'connect', '--name', 'x'],
        null,
        false,
    );
    expect(result.code).toBe(1);
    expect(result.output).not.toContain('Done 🕶');
    expect(result.output).toContain(
        'Agent connections are not available on this server yet.',
    );
    expect(result.output).toContain(
        'No agent connection credential was saved. Your personal CLI login is unchanged.',
    );
    expect(requests).toEqual([
        { method: 'GET', url: '/api/v1/user' },
        { method: 'POST', url: '/api/v2/user/agent-connections/requests' },
    ]);
    expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
    expect(await fs.readdir(path.dirname(configPath))).toEqual(['config.yaml']);
}, 30_000);
it('clears all hidden connect options and repeated projects on program reuse', async () => {
    serveUnavailableConnection();
    const source = await fs.readFile(path.join(__dirname, 'index.ts'), 'utf8');
    const entry = path.join(
        __dirname,
        `.entry-connect-reuse-${process.pid}.ts`,
    );
    try {
        await fs.writeFile(
            entry,
            source.replace(
                'program.parseAsync().then(successHandler).catch(errorHandler);',
                `
            void (async () => {
                await program.parseAsync(['agent', 'connect', '--name', 'work', '--capabilities', 'query', '--expires-in', '1h', '--connection', '--project', '33333333-3333-4333-8333-333333333333', '--project', '44444444-4444-4444-8444-444444444444'], { from: 'user' });
                process.exitCode = 0;
                await program.parseAsync(['agent', 'connect'], { from: 'user' });
                successHandler();
            })().catch(errorHandler);
        `,
            ),
        );
        const result = await runCli([], null, false, entry);
        expect(result.code).toBe(0);
        expect(result.output).toContain('Agent already connected');
        expect(result.output).toContain('Done 🕶');
        expect(requests).toEqual([
            { method: 'GET', url: '/api/v1/user' },
            { method: 'POST', url: '/api/v2/user/agent-connections/requests' },
            {
                method: 'GET',
                url: '/api/v2/projects/44444444-4444-4444-8444-444444444444/ai-access/me',
            },
        ]);
        expect(await fs.readdir(path.dirname(configPath))).toEqual([
            'config.yaml',
        ]);
    } finally {
        await fs.rm(entry, { force: true });
    }
}, 30_000);
it('rejects a port suffix in the new flow before a request', async () => {
    const result = await runCli(
        ['agent', 'connect', '--connection', '--oauth-port', '4321suffix'],
        null,
        false,
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(
        'Port must be a number between 1 and 65535',
    );
    expect(requests).toEqual([]);
}, 30_000);

it('does not add an anonymous identity to personal config during approval', async () => {
    serveUnavailableConnection();
    contents = yaml.dump({
        context: { serverUrl: instance, apiKey: 'stored-human-key' },
    });
    await fs.writeFile(configPath, contents);
    const result = await runCli(
        ['agent', 'connect', '--connection'],
        null,
        false,
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(
        'Agent connections are not available on this server yet.',
    );
    expect(await fs.readFile(configPath, 'utf8')).toBe(contents);
    expect(await fs.readdir(path.dirname(configPath))).toEqual(['config.yaml']);
}, 30_000);
it('does not create missing personal config when starting with environment credentials', async () => {
    serveUnavailableConnection();
    await fs.rm(configPath);
    const result = await runCli(
        ['agent', 'connect', '--connection'],
        null,
        true,
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain(
        'Agent connections are not available on this server yet.',
    );
    expect(await fs.readdir(path.dirname(configPath))).toEqual([]);
}, 30_000);
