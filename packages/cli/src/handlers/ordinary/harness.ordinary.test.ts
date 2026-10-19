import * as childProcess from 'child_process';
import { once } from 'events';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { personalConfig, runOrdinaryCli, saveConfig } from './harness.mocks';

vi.mock('child_process', async (original) => {
    const module = await original<typeof import('child_process')>();
    return { ...module, spawn: vi.fn(module.spawn) };
});

it('times out and kills a real CLI child when its HTTP response never arrives', async () => {
    const home = await fs.mkdtemp(path.join(tmpdir(), 'ordinary-hung-child-'));
    const server = createServer();
    const spawn = vi.mocked(childProcess.spawn);
    const waiting = new AbortController();
    try {
        for (const key of [
            'LIGHTDASH_AGENT_CONNECTION',
            'LIGHTDASH_API_KEY',
            'LIGHTDASH_PROJECT',
            'LIGHTDASH_URL',
            'LIGHTDASH_PROXY_AUTHORIZATION',
            'LIGHTDASH_API_TIMEOUT_MS',
        ])
            vi.stubEnv(key, undefined);
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('Missing server');
        await saveConfig(
            home,
            personalConfig(`http://127.0.0.1:${address.port}`),
        );
        const received = once(server, 'request', { signal: waiting.signal });
        const result = runOrdinaryCli(home, [
            'warehouse-catalog',
            '--json',
        ]).then(
            () => null,
            (error: Error) => error,
        );
        const req = await Promise.race([
            received.then(([request]) => request),
            result.then(() => null),
        ]);
        if (req === null)
            throw new Error('The CLI child ended before sending a request');
        expect(req.headers.authorization).toBe('ApiKey ldpat_pin');
        expect(spawn).toHaveBeenCalledOnce();
        const child = spawn.mock.results[0].value as childProcess.ChildProcess;
        const closed = once(child, 'close');
        expect((await result)?.message).toBe(
            'CLI child timed out after 20000ms: warehouse-catalog --json',
        );
        expect(await closed).toEqual([null, 'SIGKILL']);
        expect(child.signalCode).toBe('SIGKILL');
        expect(() => process.kill(child.pid!, 0)).toThrow();
    } finally {
        waiting.abort();
        const child = spawn.mock.results[0]?.value as
            | childProcess.ChildProcess
            | undefined;
        if (child && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        await fs.rm(home, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    }
}, 30_000);
