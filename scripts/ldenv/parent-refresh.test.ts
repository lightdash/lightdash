import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parentBuildSecrets } from './lifecycle';
import type { Environment, Parent } from './model';
import {
    refreshStaleParent,
    type ParentRefreshOperations,
} from './parent-refresh';

const hour = 60 * 60 * 1000;
const now = Date.parse('2026-09-29T12:00:00.000Z');

const parent = (sha: string, hoursOld: number) =>
    ({
        sha,
        path: `/parents/${sha.slice(0, 12)}`,
        builtAt: new Date(now - hoursOld * hour).toISOString(),
    }) as Parent;

function operations(
    overrides: Partial<ParentRefreshOperations> = {},
): ParentRefreshOperations & { started: string[]; fetched: number } {
    const record = {
        started: [] as string[],
        fetched: 0,
        parents: async () => [parent('a'.repeat(40), 7)],
        latestMain: async () => {
            record.fetched += 1;
            return 'b'.repeat(40);
        },
        busy: async () => false,
        start: async (root: string) => {
            record.started.push(root);
        },
        now: () => now,
        ...overrides,
    };
    return record;
}

test('an old parent behind main starts a background refresh', async () => {
    const ops = operations();
    const reason = await refreshStaleParent('/repo', ops, 6 * hour);
    assert.deepEqual(ops.started, ['/repo']);
    assert.match(reason ?? '', /older than 6h/);
});

test('a young parent is left alone without fetching', async () => {
    const ops = operations({
        parents: async () => [parent('a'.repeat(40), 2)],
    });
    assert.equal(await refreshStaleParent('/repo', ops, 6 * hour), null);
    assert.equal(ops.fetched, 0);
    assert.deepEqual(ops.started, []);
});

test('the newest parent decides, not an older one', async () => {
    const ops = operations({
        parents: async () => [
            parent('c'.repeat(40), 30),
            parent('a'.repeat(40), 1),
        ],
    });
    assert.equal(await refreshStaleParent('/repo', ops, 6 * hour), null);
    assert.deepEqual(ops.started, []);
});

test('an old parent that already matches main is not rebuilt', async () => {
    const ops = operations({ latestMain: async () => 'a'.repeat(40) });
    assert.equal(await refreshStaleParent('/repo', ops, 6 * hour), null);
    assert.deepEqual(ops.started, []);
});

test('foreground work or a running build defers the refresh', async () => {
    const ops = operations({ busy: async () => true });
    assert.equal(await refreshStaleParent('/repo', ops, 6 * hour), null);
    assert.equal(ops.fetched, 0);
    assert.deepEqual(ops.started, []);
});

test('no parent at all does not start a build', async () => {
    const ops = operations({ parents: async () => [] });
    assert.equal(await refreshStaleParent('/repo', ops, 6 * hour), null);
    assert.deepEqual(ops.started, []);
});

test('a parent build without a licence in the source inherits the newest parent licence', async () => {
    const secrets = await parentBuildSecrets('/source', {
        localSecrets: async (root: string): Promise<Environment> =>
            root === '/parents/aaaaaaaaaaaa'
                ? { LIGHTDASH_LICENSE_KEY: 'from-parent' }
                : root === '/parents/cccccccccccc'
                  ? { LIGHTDASH_LICENSE_KEY: 'older-parent' }
                  : { OTHER: '1' },
        parents: async () => [
            parent('c'.repeat(40), 30),
            parent('a'.repeat(40), 7),
        ],
    });
    assert.equal(secrets.LIGHTDASH_LICENSE_KEY, 'from-parent');
    assert.equal(secrets.OTHER, '1');
});

test('a source licence wins over the parent licence', async () => {
    const secrets = await parentBuildSecrets('/source', {
        localSecrets: async (root: string): Promise<Environment> =>
            root === '/source'
                ? { LIGHTDASH_LICENSE_KEY: 'source' }
                : { LIGHTDASH_LICENSE_KEY: 'parent' },
        parents: async () => [parent('a'.repeat(40), 7)],
    });
    assert.equal(secrets.LIGHTDASH_LICENSE_KEY, 'source');
});
