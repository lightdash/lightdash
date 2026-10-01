import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import {
    mkdir,
    readdir,
    readFile,
    rm,
    utimes,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';

const testHome = path.join(
    os.tmpdir(),
    `ldenv-foreground-tests-${process.pid}`,
);
process.env.LDENV_HOME = testHome;
after(() => rm(testHome, { recursive: true, force: true }));

const leases = path.join(testHome, 'foreground');
const instances = path.join(testHome, 'instances');
const longAgo = new Date('2020-01-01T00:00:00.000Z');
let unrelated: ChildProcess;

beforeEach(async () => {
    await rm(leases, { recursive: true, force: true });
    await rm(instances, { recursive: true, force: true });
    await mkdir(leases, { recursive: true });
    unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
    await once(unrelated, 'spawn');
});
afterEach(async () => {
    unrelated.kill('SIGKILL');
    await once(unrelated, 'exit').catch(() => {});
});

async function writeLease(
    name: string,
    lease: Record<string, unknown>,
    modifiedAt?: Date,
): Promise<string> {
    const file = path.join(leases, `${name}.json`);
    await writeFile(file, JSON.stringify(lease));
    if (modifiedAt) await utimes(file, modifiedAt, modifiedAt);
    return file;
}

test('a lease whose pid now belongs to another process is stale and removed', async () => {
    const { foregroundActive } = await import('./io.js');
    const file = await writeLease('reused', {
        pid: unrelated.pid,
        start: 'Mon Sep 28 12:05:00 2026',
    });
    assert.equal(await foregroundActive(), false);
    assert.equal(existsSync(file), false);
});

test('a lease for a dead process is stale and removed', async () => {
    const { foregroundActive } = await import('./io.js');
    const file = await writeLease('dead', { pid: 99999999, start: null });
    assert.equal(await foregroundActive(), false);
    assert.equal(existsSync(file), false);
});

test('a live foreground lease records its start and stays active', async () => {
    const { foregroundActive, foregroundWork } = await import('./io.js');
    await foregroundWork(async () => {
        const [name] = await readdir(leases);
        const lease = JSON.parse(
            await readFile(path.join(leases, name), 'utf8'),
        ) as { pid: number; start: string | null };
        assert.equal(lease.pid, process.pid);
        assert.match(lease.start ?? '', /\d\d:\d\d:\d\d \d{4}$/);
        assert.equal(await foregroundActive(), true);
        assert.equal(await foregroundActive(), true);
        assert(existsSync(path.join(leases, name)));
    });
    assert.equal(await foregroundActive(), false);
});

test('a legacy lease older than its process is stale and removed', async () => {
    const { foregroundActive } = await import('./io.js');
    const file = await writeLease('legacy', { pid: unrelated.pid }, longAgo);
    assert.equal(await foregroundActive(), false);
    assert.equal(existsSync(file), false);
});

test('a legacy lease written after its process started stays active', async () => {
    const { foregroundActive } = await import('./io.js');
    const file = await writeLease('legacy-live', { pid: unrelated.pid });
    assert.equal(await foregroundActive(), true);
    assert(existsSync(file));
});

test('a starting instance counts only while its monitor predates the record', async () => {
    const { foregroundActive, statePath } = await import('./io.js');
    const { newInstance } = await import('./model.js');
    const instance = newInstance(
        path.join(testHome, 'worktree'),
        'a'.repeat(40),
    );
    instance.phase = 'starting';
    instance.monitorPid = unrelated.pid ?? null;
    await mkdir(instances, { recursive: true });
    instance.updatedAt = longAgo.toISOString();
    await writeFile(statePath(instance.id), JSON.stringify(instance));
    assert.equal(await foregroundActive(), false);
    instance.updatedAt = new Date().toISOString();
    await writeFile(statePath(instance.id), JSON.stringify(instance));
    assert.equal(await foregroundActive(), true);
});
