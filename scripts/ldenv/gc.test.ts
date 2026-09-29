import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { garbageCollect } from './lifecycle';
import { newInstance } from './model';

test('gc reports one failed stale instance and still cleans the next instance', async () => {
    const first = newInstance(
        path.join(os.tmpdir(), `missing-first-${process.pid}`),
        'a'.repeat(40),
    );
    const second = newInstance(
        path.join(os.tmpdir(), `missing-second-${process.pid}`),
        'a'.repeat(40),
    );
    const cleaned: string[] = [];
    const warnings: string[] = [];
    const write = process.stderr.write;
    process.stderr.write = ((message: string) => {
        warnings.push(message);
        return true;
    }) as typeof write;
    try {
        await garbageCollect('/unused', true, {
            instances: async () => [first, second],
            down: async (instance) => {
                cleaned.push(instance.id);
            },
            withLock: async (name, work) => {
                if (name === first.id)
                    throw new Error('another command owns this instance');
                return work();
            },
            cleanupOrphans: async () => [],
        });
        assert.deepEqual(cleaned, [second.id]);
        assert.match(warnings.join(''), new RegExp(`GC SKIPPED ${first.id}`));
        assert.match(warnings.join(''), /another command owns/);
    } finally {
        process.stderr.write = write;
    }
});

test('automatic gc excludes its protected instance and re-reads candidates under lock', async () => {
    const candidate = newInstance(
        path.join(os.tmpdir(), `missing-candidate-${process.pid}`),
        'a'.repeat(40),
    );
    const current = { ...candidate, worktree: process.cwd() };
    const stale = newInstance(
        path.join(os.tmpdir(), `missing-stale-${process.pid}`),
        'a'.repeat(40),
    );
    const protectedInstance = newInstance(
        path.join(os.tmpdir(), `missing-protected-${process.pid}`),
        'a'.repeat(40),
    );
    const cleaned: string[] = [];
    let reads = 0;
    await garbageCollect(
        '/unused',
        false,
        {
            instances: async () => {
                reads += 1;
                return reads === 1
                    ? [candidate, stale, protectedInstance]
                    : [current, stale, protectedInstance];
            },
            down: async (instance) => {
                cleaned.push(instance.id);
            },
            withLock: async (_name, work) => work(),
            cleanupOrphans: async () => [],
        },
        protectedInstance.id,
    );
    assert.deepEqual(cleaned, [stale.id]);
});
