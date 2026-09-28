import { existsSync } from 'node:fs';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
    git,
    home,
    listJson,
    readJson,
    runner,
    withLock,
    writeJson,
} from './io';
import { assertInstance, instanceId, json, type Instance } from './model';
import { pm2 } from './processes';

export type CleanupEntry = {
    directory: string;
    kind: 'warm' | 'tool';
    remove: boolean;
    reason: string;
};
type ToolRecord = { directory: string; previousDirectory?: string | null };
type Worktree = {
    directory: string;
    detached: boolean;
    locked: boolean;
    branch?: string;
    head?: string;
};
export function worktreeRecords(output: string): Worktree[] {
    return output
        .split('\0\0')
        .filter(Boolean)
        .map((block) => {
            const fields = block.split('\0');
            return {
                directory: fields[0].replace(/^worktree /, ''),
                detached: fields.includes('detached'),
                locked: fields.some((field) => /^locked(?: |$)/.test(field)),
                branch: fields
                    .find((field) => field.startsWith('branch '))
                    ?.slice(7),
                head: fields
                    .find((field) => field.startsWith('HEAD '))
                    ?.slice(5),
            };
        });
}
export type CleanupRuntime = {
    references: () => Promise<string>;
    worktrees: () => Promise<Worktree[]>;
    status: (directory: string) => Promise<string>;
    remove: (directory: string) => Promise<void>;
    refHead?: (ref: string) => Promise<string>;
    deleteBranch?: (ref: string, head: string) => Promise<void>;
};
function runtime(root: string): CleanupRuntime {
    return {
        references: async () => {
            const inventory = await pm2(['jlist']);
            const start = inventory.search(/\[\s*(?:\{|\])/);
            if (start < 0) throw new Error('Cannot inspect PM2 before cleanup');
            const processes = json<unknown[]>(inventory.slice(start));
            const [commands, files] = await Promise.all([
                runner.run('ps', ['-axo', 'pid=,command='], { cwd: root }),
                runner.run('lsof', ['-w', '-nP', '-F', 'n'], { cwd: root }),
            ]);
            return `${JSON.stringify(processes)}\n${commands}\n${files}`;
        },
        worktrees: async () =>
            worktreeRecords(
                await git(root, ['worktree', 'list', '--porcelain', '-z']),
            ),
        status: (directory) =>
            git(directory, [
                'status',
                '--porcelain',
                '--ignored',
                '--untracked-files=normal',
            ]),
        remove: async (directory) => {
            await git(root, ['worktree', 'remove', '--force', directory]);
        },
        refHead: (ref) => git(root, ['rev-parse', '--verify', ref]),
        deleteBranch: async (ref, head) => {
            await git(root, ['update-ref', '-d', ref, head]);
        },
    };
}
export function isOwnedWarm(instance: Instance, base = home): boolean {
    return (
        (instance.kind === 'spare' || instance.kind === 'warming') &&
        path.dirname(instance.worktree) === path.join(base, 'warm') &&
        /^[a-f0-9]{8}-[a-f0-9]{3}$/.test(path.basename(instance.worktree))
    );
}
async function directories(base: string): Promise<string[]> {
    if (!existsSync(base)) return [];
    return (await readdir(base)).map((name) => path.join(base, name));
}
function unexpectedEdits(status: string): boolean {
    return status
        .split('\n')
        .some(
            (line) =>
                line &&
                !line.startsWith('!! ') &&
                !/^.. packages\/(backend\/src\/generated\/|common\/src\/schemas\/json\/|formula\/src\/grammar\/parser\.js)/.test(
                    line,
                ),
        );
}
async function inspectCandidate(
    directory: string,
    kind: CleanupEntry['kind'],
    references: string,
    worktrees: Worktree[],
    io: CleanupRuntime,
    instance?: Instance,
): Promise<CleanupEntry> {
    const result = (remove: boolean, reason: string) => ({
        directory,
        kind,
        remove,
        reason,
    });
    if (
        (await lstat(directory)).isSymbolicLink() ||
        (await realpath(directory)) !== directory
    )
        return result(false, 'Path is not a private real directory');
    const worktree = worktrees.find((item) => item.directory === directory);
    if (!worktree)
        return result(false, 'Not a registered worktree; inspect manually');
    if (worktree.locked)
        return result(false, 'Locked or branch worktree may belong to a user');
    if (instance?.readyWorktree) {
        const { branch, head, publication, retiring } = instance.readyWorktree;
        const expectedBranch = retiring?.hiddenAt ? retiring.branch : branch;
        const pendingDetached = publication === 'pending' && worktree.detached;
        if (retiring && !retiring.hiddenAt)
            return result(false, 'Ready branch retirement is not hidden');
        if (
            (instance.kind !== 'spare' && instance.kind !== 'warming') ||
            worktree.head !== head ||
            (!pendingDetached &&
                worktree.branch !== `refs/heads/${expectedBranch}`)
        )
            return result(false, 'Ready branch or HEAD changed');
        if (!pendingDetached) {
            if (io.refHead) {
                let currentHead: string;
                try {
                    currentHead = await io.refHead(
                        `refs/heads/${expectedBranch}`,
                    );
                } catch {
                    return result(false, 'Ready branch ref is missing');
                }
                if (currentHead !== head)
                    return result(false, 'Ready branch ref changed');
            }
        } else {
            if (
                worktrees.some(
                    (item) =>
                        item.directory !== directory &&
                        (item.branch === `refs/heads/${branch}` ||
                            item.branch === `refs/heads/${retiring?.branch}`),
                )
            )
                return result(
                    false,
                    'Ready branch is used by another worktree',
                );
            if (io.refHead) {
                let pendingRefHead: string | null = null;
                try {
                    pendingRefHead = await io.refHead(`refs/heads/${branch}`);
                } catch {
                    pendingRefHead = null;
                }
                if (pendingRefHead !== null && pendingRefHead !== head)
                    return result(false, 'Ready branch ref changed');
            }
        }
    } else if (!worktree.detached)
        return result(false, 'Locked or branch worktree may belong to a user');
    if (references.includes(directory))
        return result(false, 'Referenced by a process or open file');
    if (unexpectedEdits(await io.status(directory)))
        return result(false, 'Worktree has user edits');
    return result(true, 'Unreferenced ldenv-owned worktree');
}

export async function assertOwnedWarmForTeardown(
    instance: Instance,
    root: string,
    base = home,
    io = runtime(root),
): Promise<void> {
    assertInstance(instance);
    if (!isOwnedWarm(instance, base) || !existsSync(instance.worktree))
        throw new Error(
            `Warm worktree retained: ${instance.worktree}: Ownership is not proven`,
        );
    const checked = await inspectCandidate(
        instance.worktree,
        'warm',
        '',
        await io.worktrees(),
        io,
        instance,
    );
    if (!checked.remove)
        throw new Error(
            `Warm worktree retained: ${instance.worktree}: ${checked.reason}`,
        );
}
export async function cleanupPlan(
    root: string,
    base = home,
    io = runtime(root),
): Promise<CleanupEntry[]> {
    const [references, worktrees, instances, retained] = await Promise.all([
        io.references(),
        io.worktrees(),
        listJson<Instance>(path.join(base, 'instances')),
        listJson<{ directory: string }>(path.join(base, 'retained-worktrees')),
    ]);
    const warm = await directories(path.join(base, 'warm'));
    const tools = await directories(path.join(base, 'tools'));
    const toolFile = path.join(base, 'tool.json');
    const tool = existsSync(toolFile)
        ? await readJson<ToolRecord>(toolFile)
        : null;
    const previous =
        tool?.previousDirectory ??
        (
            await Promise.all(
                tools
                    .filter((directory) => directory !== tool?.directory)
                    .map(async (directory) => ({
                        directory,
                        at: (await stat(directory)).birthtimeMs,
                    })),
            )
        ).sort((a, b) => b.at - a.at)[0]?.directory;
    const result: CleanupEntry[] = [];
    for (const directory of [...warm, ...tools]) {
        const kind =
            path.dirname(directory) === path.join(base, 'warm')
                ? 'warm'
                : 'tool';
        const keep =
            kind === 'warm'
                ? instances.some((item) => item.worktree === directory) ||
                  retained.some((item) => item.directory === directory)
                : !tool ||
                  directory === tool.directory ||
                  directory === previous;
        const valid = (
            kind === 'warm' ? /^[a-f0-9]{8}-[a-f0-9]{3}$/ : /^[a-f0-9]{12}$/
        ).test(path.basename(directory));
        result.push(
            keep || !valid
                ? {
                      directory,
                      kind,
                      remove: false,
                      reason: keep
                          ? 'Registered, retained, active or previous checkout'
                          : 'Unrecognised directory name',
                  }
                : await inspectCandidate(
                      directory,
                      kind,
                      references,
                      worktrees,
                      io,
                  ),
        );
    }
    return result;
}
export async function removeCleanupEntry(
    entry: CleanupEntry,
    root: string,
    base = home,
    io = runtime(root),
): Promise<void> {
    const current = (await cleanupPlan(root, base, io)).find(
        (item) => item.directory === entry.directory,
    );
    if (!entry.remove || !current?.remove)
        throw new Error(`Cleanup no longer safe: ${entry.directory}`);
    await io.remove(entry.directory);
}
export async function cleanupOrphans(
    root: string,
    dryRun: boolean,
): Promise<CleanupEntry[]> {
    return withLock('pool-fill', () =>
        withLock('pool', () =>
            withLock('tool-install', async () => {
                const plan = await cleanupPlan(root);
                if (!dryRun)
                    for (const entry of plan.filter((item) => item.remove))
                        await removeCleanupEntry(entry, root);
                return plan;
            }),
        ),
    );
}
export async function removeOwnedWarm(
    instance: Instance,
    root: string,
    base = home,
    io = runtime(root),
): Promise<void> {
    assertInstance(instance);
    if (!isOwnedWarm(instance, base)) {
        if (path.dirname(instance.worktree) === path.join(base, 'warm'))
            await writeJson(
                path.join(
                    base,
                    'retained-worktrees',
                    `${instanceId(instance.worktree)}.json`,
                ),
                { directory: instance.worktree },
            );
        return;
    }
    if (!existsSync(instance.worktree)) return;
    const checked = await inspectCandidate(
        instance.worktree,
        'warm',
        await io.references(),
        await io.worktrees(),
        io,
        instance,
    );
    if (!checked.remove)
        throw new Error(
            `Warm worktree retained: ${instance.worktree}: ${checked.reason}`,
        );
    const pendingDetached =
        instance.readyWorktree?.publication === 'pending' &&
        (await io.worktrees()).find(
            (item) => item.directory === instance.worktree,
        )?.detached;
    const ownedRef = instance.readyWorktree
        ? `refs/heads/${!pendingDetached && instance.readyWorktree.retiring?.hiddenAt ? instance.readyWorktree.retiring.branch : instance.readyWorktree.branch}`
        : null;
    let deleteOwnedRef = false;
    if (ownedRef && io.refHead) {
        try {
            deleteOwnedRef =
                (await io.refHead(ownedRef)) === instance.readyWorktree?.head;
        } catch {
            deleteOwnedRef = false;
        }
    }
    await io.remove(instance.worktree);
    if (instance.readyWorktree && ownedRef && deleteOwnedRef) {
        const { head } = instance.readyWorktree;
        const removeBranch =
            io.deleteBranch ??
            (async (ref: string, expected: string) => {
                await git(root, ['update-ref', '-d', ref, expected]);
            });
        await removeBranch(ownedRef, head);
    }
}
