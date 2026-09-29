import { existsSync } from 'node:fs';
import path from 'node:path';
import { alive, foregroundActive, git, home, readJson, writeJson } from './io';
import { parents } from './lifecycle';
import type { Parent } from './model';
import { background } from './processes';

export const parentMaxAgeMs =
    Number(process.env.LDENV_PARENT_MAX_AGE_HOURS ?? '6') * 60 * 60 * 1000;
export const parentCheckIntervalMs = 60 * 60 * 1000;

const refreshFile = () => path.join(home, 'parent-refresh.json');

const pidAt = async (file: string): Promise<number | null> =>
    existsSync(file)
        ? ((await readJson<{ pid: number }>(file).catch(() => null))?.pid ??
          null)
        : null;

export type ParentRefreshOperations = {
    parents: () => Promise<Parent[]>;
    latestMain: (root: string) => Promise<string>;
    busy: () => Promise<boolean>;
    start: (root: string) => Promise<void>;
    now: () => number;
};

export const parentRefreshOperations: ParentRefreshOperations = {
    parents,
    latestMain: async (root) => {
        await git(root, ['fetch', '--quiet', 'origin', 'main']);
        return git(root, ['rev-parse', '--verify', 'origin/main^{commit}']);
    },
    busy: async () => {
        const owners = await Promise.all([
            pidAt(refreshFile()),
            pidAt(path.join(home, 'locks/parent-build/owner.json')),
            pidAt(path.join(home, 'pool-refill.json')),
            pidAt(path.join(home, 'locks/pool-fill/owner.json')),
        ]);
        return owners.some((pid) => alive(pid)) || (await foregroundActive());
    },
    start: async (root) => {
        const pid = await background(
            ['parent', 'refresh', '--worktree', root],
            'parent-refresh',
        );
        await writeJson(refreshFile(), {
            pid,
            startedAt: new Date().toISOString(),
            log: path.join(home, 'logs/parent-refresh.log'),
        });
    },
    now: () => Date.now(),
};

export async function refreshStaleParent(
    root: string,
    operations: ParentRefreshOperations = parentRefreshOperations,
    maxAgeMs = parentMaxAgeMs,
): Promise<string | null> {
    const newest = (await operations.parents()).sort((a, b) =>
        b.builtAt.localeCompare(a.builtAt),
    )[0];
    if (!newest) return null;
    if (operations.now() - Date.parse(newest.builtAt) < maxAgeMs) return null;
    if (await operations.busy()) return null;
    const main = await operations.latestMain(root);
    if (!main || main === newest.sha) return null;
    await operations.start(root);
    return `parent ${newest.sha.slice(0, 12)} is older than ${Math.round(maxAgeMs / 3_600_000)}h and origin/main is ${main.slice(0, 12)}`;
}
