import { promises as fs } from 'fs';
import { hostname, tmpdir } from 'os';
import path from 'path';
import { acquireLock } from './configLock';

let directory: string;
let file: string;
const options = { waitMs: 120, pollMs: 5 };
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-lock-'));
    file = path.join(directory, 'agent.lock');
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
it('serializes contenders and gives private permissions', async () => {
    const release = await acquireLock(file, options);
    expect((await fs.stat(file)).mode % 0o1000).toBe(0o600);
    let entered = false;
    const next = acquireLock(file, options).then(async (done) => {
        entered = true;
        await done();
    });
    await new Promise((resolve) => {
        setTimeout(resolve, 20);
    });
    expect(entered).toBe(false);
    await release();
    await next;
    expect(entered).toBe(true);
});
it('times out without stealing a live owner', async () => {
    const release = await acquireLock(file, options);
    const contents = await fs.readFile(file, 'utf8');
    await expect(acquireLock(file, options)).rejects.toThrow(
        'Another CLI process',
    );
    expect(await fs.readFile(file, 'utf8')).toBe(contents);
    await release();
});
it('recovers a dead local owner with two recoverers', async () => {
    await fs.writeFile(
        file,
        JSON.stringify({
            ownerId: 'dead-owner',
            pid: 2147483647,
            host: hostname(),
            startedAt: new Date().toISOString(),
        }),
    );
    let inside = 0;
    await Promise.all(
        [1, 2].map(async () => {
            const release = await acquireLock(file, {
                waitMs: 1000,
                pollMs: 5,
            });
            inside += 1;
            expect(inside).toBe(1);
            await new Promise((resolve) => {
                setTimeout(resolve, 15);
            });
            inside -= 1;
            await release();
        }),
    );
});
it.each([
    '',
    '{',
    JSON.stringify({
        ownerId: 'remote',
        pid: 2147483647,
        host: 'other-host',
        startedAt: new Date().toISOString(),
    }),
])('does not steal incomplete or remote metadata', async (contents) => {
    await fs.writeFile(file, contents);
    await expect(acquireLock(file, options)).rejects.toThrow(
        'Another CLI process',
    );
    expect(await fs.readFile(file, 'utf8')).toBe(contents);
});
it('checks ownership before release', async () => {
    const release = await acquireLock(file, options);
    const replacement = JSON.stringify({
        ownerId: 'replacement',
        pid: process.pid,
        host: hostname(),
        startedAt: new Date().toISOString(),
    });
    await fs.writeFile(file, replacement);
    await release();
    expect(await fs.readFile(file, 'utf8')).toBe(replacement);
});
it('fails closed on an interrupted recovery sentinel', async () => {
    await fs.writeFile(`${file}.recovery`, 'interrupted');
    await expect(acquireLock(file, options)).rejects.toThrow(
        'Interrupted config lock recovery',
    );
});
