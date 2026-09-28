import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listJson, writeJson } from './io';
import type { Parent } from './model';
import { retireParent } from './parent-gc';

test('parent gc retires selection before dropping resources and retries partial removal', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'ldenv-parent-gc-'));
    try {
        const sha = 'a'.repeat(40);
        const parent = {
            sha,
            path: path.join(base, 'parents', sha.slice(0, 12)),
            database: `ldp_${sha.slice(0, 12)}`,
            seedComplete: true,
        } as Parent;
        await mkdir(parent.path, { recursive: true });
        const active = path.join(base, 'manifests', `${sha}.json`);
        const retired = path.join(base, 'manifests', 'retired', `${sha}.json`);
        await writeJson(active, parent);
        const events: string[] = [];
        let fail = true;
        const operations = {
            ensurePostgres: async () => {},
            dropDatabase: async (_root: string, database: string) => {
                assert.equal(existsSync(active), false);
                assert.equal(existsSync(retired), true);
                assert.deepEqual(
                    await listJson(path.join(base, 'manifests')),
                    [],
                );
                events.push(`drop ${database}`);
            },
            git: async (_root: string, args: string[]) => {
                assert.deepEqual(args, [
                    'worktree',
                    'remove',
                    '--force',
                    parent.path,
                ]);
                events.push('remove worktree');
                if (fail) throw new Error('worktree locked');
                return '';
            },
        };
        await assert.rejects(
            retireParent(base, parent, base, operations),
            /worktree locked/,
        );
        assert.equal(existsSync(retired), true);
        fail = false;
        await rm(parent.path, { recursive: true });
        await retireParent(base, parent, base, operations);
        assert.equal(existsSync(retired), false);
        assert.deepEqual(events, [
            `drop ${parent.database}`,
            'remove worktree',
            `drop ${parent.database}`,
        ]);
        await writeJson(active, { ...parent, path: '/unowned' });
        await assert.rejects(
            retireParent(
                base,
                { ...parent, path: '/unowned' },
                base,
                operations,
            ),
            /ownership/,
        );
        assert.equal(existsSync(active), true);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
