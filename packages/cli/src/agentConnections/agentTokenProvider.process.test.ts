import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { createServer, type Server } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from './fixtures';
import { AgentConnectionStore } from './store';

let directory: string;
let server: Server;
let store: AgentConnectionStore;
let slot: ReturnType<typeof slotFixture>;
let refreshes: URLSearchParams[];
let holdResponse: boolean;
let rotated: () => void;
let rotation: Promise<void>;
const children: ChildProcess[] = [];
const launch = () => {
    const child = spawn(
        process.execPath,
        [
            '--import',
            'tsx',
            path.join(__dirname, 'providerProcess.fixture.ts'),
            store.filePath,
            slot.instanceUrl,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    children.push(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
        stdout += String(data);
    });
    child.stderr.on('data', (data) => {
        stderr += String(data);
    });
    const finished = new Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
    }>((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) => resolve({ code, stdout, stderr }));
    });
    return { child, finished };
};
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-process-'));
    store = new AgentConnectionStore(
        path.join(directory, 'agent-connections.yaml'),
    );
    refreshes = [];
    holdResponse = false;
    rotation = new Promise((resolve) => {
        rotated = resolve;
    });
    server = createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/v1/oauth/token') {
            let body = '';
            for await (const chunk of req) body += String(chunk);
            refreshes.push(new URLSearchParams(body));
            rotated();
            if (holdResponse) return;
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            res.end(
                JSON.stringify({
                    access_token: 'new-access',
                    refresh_token: 'new-refresh',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_expires_in: 3600,
                    scope: 'read write',
                }),
            );
        } else if (req.url === '/api/v1/user')
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        userUuid: slot.personUuid,
                        organizationUuid: slot.organizationUuid,
                    },
                }),
            );
        else
            res.end(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        grantUuid: slot.grantUuid,
                        name: slot.name,
                        clientId: slot.clientId,
                        approvedAt: slot.approvedAt,
                        expiresAt: slot.grantExpiresAt,
                        ...slot.lastReported,
                    },
                }),
            );
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
        throw new Error('No server address');
    const instanceUrl = `http://127.0.0.1:${address.port}`;
    slot = { ...slotFixture(), instanceUrl, resource: instanceUrl };
    slot.tokens.accessTokenExpiresAt = new Date(
        Date.now() - 1000,
    ).toISOString();
    await store.saveSlot(slot);
});
afterEach(async () => {
    for (const child of children.splice(0))
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await fs.rm(directory, { recursive: true, force: true });
});
it('two real Node processes rotate exactly once and both use the saved pair', async () => {
    const a = launch();
    const b = launch();
    const results = await Promise.all([a.finished, b.finished]);
    expect(results).toEqual(
        [1, 2].map(() => ({
            code: 0,
            stdout: JSON.stringify({ generation: 2, rotated: true }),
            stderr: '',
        })),
    );
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0].get('grant_type')).toBe('refresh_token');
    expect((await store.readSlot(slot))?.tokens.refreshToken).toBe(
        'new-refresh',
    );
}, 20_000);
it('kills the rotating Node process before save and never posts its token again', async () => {
    holdResponse = true;
    const winner = launch();
    await rotation;
    expect((await store.readSlot(slot))?.refreshState.kind).toBe('in_progress');
    winner.child.kill('SIGKILL');
    await winner.finished;
    holdResponse = false;
    const next = await launch().finished;
    expect(next.code).toBe(1);
    expect(next.stderr).toContain('Reconnect');
    expect(refreshes).toHaveLength(1);
    expect((await store.readSlot(slot))?.refreshState.kind).toBe(
        'reconnect_required',
    );
    expect(next.stderr).not.toContain('private-');
}, 20_000);
