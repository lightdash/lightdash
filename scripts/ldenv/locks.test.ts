import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import {
    chmod,
    mkdir,
    readFile,
    rename,
    rm,
    utimes,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const testHome = path.join(os.tmpdir(), `ldenv-lock-tests-${process.pid}`);
process.env.LDENV_HOME = testHome;
after(() => rm(testHome, { recursive: true, force: true }));

function lockPath(name: string): string {
    return path.join(testHome, 'locks', name);
}

async function fixtureLock(
    name: string,
    owner: Record<string, unknown> | null,
): Promise<string> {
    const lock = lockPath(name);
    await mkdir(lock, { recursive: true });
    if (owner)
        await writeFile(path.join(lock, 'owner.json'), JSON.stringify(owner));
    return lock;
}

test('old lock with dead owner is reclaimed', async () => {
    const { withLock } = await import('./io.js');
    const lock = await fixtureLock('dead', {
        pid: 99999999,
        startedAt: '2020-01-01T00:00:00.000Z',
    });
    let entered = false;
    await withLock('dead', async () => {
        entered = true;
    });
    assert.equal(entered, true);
    assert.equal(existsSync(lock), false);
});

test('young dead owner and live owner remain busy', async () => {
    const { withLock } = await import('./io.js');
    await fixtureLock('young', {
        pid: 99999999,
        startedAt: new Date().toISOString(),
    });
    const originalPath = process.env.PATH;
    process.env.PATH = '/nonexistent';
    try {
        await assert.rejects(
            withLock('young', async () => {}, { yieldToForeground: false }),
            /too new to reclaim/,
        );
    } finally {
        process.env.PATH = originalPath;
    }
    await withLock('live', async () => {
        const file = path.join(lockPath('live'), 'owner.json');
        const owner = JSON.parse(await readFile(file, 'utf8')) as {
            startedAt: string;
        };
        owner.startedAt = '2020-01-01T00:00:00.000Z';
        await writeFile(file, JSON.stringify(owner));
        await assert.rejects(
            withLock('live', async () => {}, { yieldToForeground: false }),
            /pid \d+ is still running/,
        );
    });
});

test('old owner PID reused by another process is reclaimed', async () => {
    const { withLock } = await import('./io.js');
    const lock = await fixtureLock('reused', {
        pid: process.pid,
        startedAt: '2020-01-01T00:00:00.000Z',
        processStart: 'Wed Jan 01 00:00:00 2020',
        commandHash: 'old-process-command-hash',
    });
    await withLock('reused', async () => {});
    assert.equal(existsSync(lock), false);
});

test('old ownerless interrupted acquisition is reclaimed', async () => {
    const { withLock } = await import('./io.js');
    const lock = await fixtureLock('ownerless', null);
    const old = new Date('2020-01-01T00:00:00.000Z');
    await utimes(lock, old, old);
    await withLock('ownerless', async () => {});
    assert.equal(existsSync(lock), false);
});

test('concurrent reclaimers enter the lock one at a time', async () => {
    const { withLock } = await import('./io.js');
    await fixtureLock('race', {
        pid: 99999999,
        startedAt: '2020-01-01T00:00:00.000Z',
    });
    let active = 0;
    let maximum = 0;
    await Promise.all(
        Array.from({ length: 4 }, () =>
            withLock(
                'race',
                async () => {
                    active += 1;
                    maximum = Math.max(maximum, active);
                    await delay(20);
                    active -= 1;
                },
                { timeoutMs: 2000, yieldToForeground: false },
            ),
        ),
    );
    assert.equal(maximum, 1);
    assert.equal(active, 0);
});

test(
    'advisory guard prevents a second reclaimer from stealing a fresh owner',
    { timeout: 5000 },
    async () => {
        const { withLock } = await import('./io.js');
        const lock = await fixtureLock('guarded-race', {
            pid: 99999999,
            startedAt: '2020-01-01T00:00:00.000Z',
        });
        const script = [
            'import fcntl, os, sys',
            'fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR, 0o600)',
            'fcntl.flock(fd, fcntl.LOCK_EX)',
            'print("LOCKED", flush=True)',
            'sys.stdin.buffer.read()',
        ].join('\n');
        const guard = spawn(
            'python3',
            ['-u', '-c', script, `${lock}.reclaim-guard`],
            {
                stdio: ['pipe', 'pipe', 'pipe'],
            },
        );
        const [ready] = await once(guard.stdout, 'data');
        assert.match(String(ready), /LOCKED/);
        let entered = 0;
        let releaseFirst!: () => void;
        const firstMayFinish = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let firstEntered!: () => void;
        const firstRunning = new Promise<void>((resolve) => {
            firstEntered = resolve;
        });
        const contenders = Array.from({ length: 2 }, () =>
            withLock(
                'guarded-race',
                async () => {
                    entered += 1;
                    if (entered === 1) {
                        firstEntered();
                        await firstMayFinish;
                    }
                },
                { timeoutMs: 3000, yieldToForeground: false },
            ),
        );
        try {
            await delay(50);
            guard.stdin.end();
            await once(guard, 'exit');
            await Promise.race([
                firstRunning,
                delay(2000).then(() => {
                    throw new Error('No reclaimer acquired the lock');
                }),
            ]);
            await delay(100);
            assert.equal(entered, 1);
            assert.equal(existsSync(lock), true);
        } finally {
            guard.stdin.end();
            guard.kill('SIGKILL');
            releaseFirst();
            await Promise.allSettled(contenders);
        }
        assert.equal(entered, 2);
    },
);

test(
    'kernel releases a crashed reclaimer guard',
    { timeout: 5000 },
    async () => {
        const { withLock } = await import('./io.js');
        const lock = await fixtureLock('guard-crash', {
            pid: 99999999,
            startedAt: '2020-01-01T00:00:00.000Z',
        });
        const script = [
            'import fcntl, os, sys',
            'fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR, 0o600)',
            'fcntl.flock(fd, fcntl.LOCK_EX)',
            'print("LOCKED", flush=True)',
            'sys.stdin.buffer.read()',
        ].join('\n');
        const guard = spawn(
            'python3',
            ['-u', '-c', script, `${lock}.reclaim-guard`],
            {
                stdio: ['pipe', 'pipe', 'pipe'],
            },
        );
        const [ready] = await once(guard.stdout, 'data');
        assert.match(String(ready), /LOCKED/);
        try {
            await assert.rejects(
                withLock('guard-crash', async () => {}, {
                    yieldToForeground: false,
                }),
                /another lock reclaimer is active/,
            );
        } finally {
            guard.kill('SIGKILL');
            await once(guard, 'exit');
        }
        await withLock('guard-crash', async () => {});
        assert.equal(existsSync(lock), false);
    },
);

test(
    'missing or stalled python guard fails closed and cleans up',
    { timeout: 5000 },
    async () => {
        const { withLock } = await import('./io.js');
        await fixtureLock('python-missing', {
            pid: 99999999,
            startedAt: '2020-01-01T00:00:00.000Z',
        });
        const originalPath = process.env.PATH;
        process.env.PATH = '/nonexistent';
        try {
            await assert.rejects(
                withLock('python-missing', async () => {}),
                /python3 is required to inspect a contended ldenv lock/,
            );
        } finally {
            process.env.PATH = originalPath;
        }
        await withLock('python-missing', async () => {});
        await fixtureLock('python-stalled', {
            pid: 99999999,
            startedAt: '2020-01-01T00:00:00.000Z',
        });
        const bin = path.join(testHome, 'fake-bin');
        await mkdir(bin);
        const fakePython = path.join(bin, 'python3');
        await writeFile(fakePython, '#!/bin/sh\nexec /bin/sleep 10\n');
        await chmod(fakePython, 0o700);
        process.env.PATH = bin;
        try {
            await assert.rejects(
                withLock('python-stalled', async () => {}),
                /guard startup timed out/,
            );
        } finally {
            process.env.PATH = originalPath;
        }
        await withLock('python-stalled', async () => {});
    },
);

test('owner record hashes the process command', async () => {
    const { withLock } = await import('./io.js');
    await withLock('owner-hash', async () => {
        const owner = JSON.parse(
            await readFile(
                path.join(lockPath('owner-hash'), 'owner.json'),
                'utf8',
            ),
        ) as { commandHash: string; command?: string };
        assert.match(owner.commandHash, /^[a-f0-9]{64}$/);
        assert.equal(owner.command, undefined);
    });
});

test('release leaves a replacement owner intact', async () => {
    const { withLock } = await import('./io.js');
    const lock = lockPath('replaced');
    const moved = `${lock}.moved`;
    await assert.rejects(
        withLock('replaced', async () => {
            await rename(lock, moved);
            await mkdir(lock);
            await writeFile(
                path.join(lock, 'owner.json'),
                JSON.stringify({
                    id: 'new-owner',
                    pid: process.pid,
                    startedAt: new Date().toISOString(),
                }),
            );
        }),
        /Lock ownership changed before release/,
    );
    assert.equal(existsSync(lock), true);
    assert.equal(
        (
            JSON.parse(
                await readFile(path.join(lock, 'owner.json'), 'utf8'),
            ) as {
                id: string;
            }
        ).id,
        'new-owner',
    );
});
