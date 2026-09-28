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
type Worktree = { directory: string; detached: boolean; locked: boolean };
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
            };
        });
}
export function ancestorPids(table: string, pid: number): Set<string> {
    const parents = new Map<string, string>();
    for (const line of table.split('\n')) {
        const [child, parent] = line.trim().split(/\s+/);
        if (child && parent) parents.set(child, parent);
    }
    const ancestors = new Set<string>();
    let current: string | undefined = String(pid);
    while (current && current !== '0' && !ancestors.has(current)) {
        ancestors.add(current);
        current = parents.get(current);
    }
    return ancestors;
}
export function commandsOutside(
    commands: string,
    excluded: Set<string>,
): string {
    return commands
        .split('\n')
        .filter((line) => !excluded.has(line.trim().split(/\s+/)[0]))
        .join('\n');
}
export type CleanupRuntime = {
    references: () => Promise<string>;
    worktrees: () => Promise<Worktree[]>;
    status: (directory: string) => Promise<string>;
    remove: (directory: string) => Promise<void>;
};
function runtime(root: string): CleanupRuntime {
    return {
        references: async () => {
            const inventory = await pm2(['jlist']);
            const start = inventory.search(/\[\s*(?:\{|\])/);
            if (start < 0) throw new Error('Cannot inspect PM2 before cleanup');
            const processes = json<unknown[]>(inventory.slice(start));
            const [commands, files, table] = await Promise.all([
                runner.run('ps', ['-axo', 'pid=,command='], { cwd: root }),
                runner.run('lsof', ['-w', '-nP', '-F', 'n'], { cwd: root }),
                runner.run('ps', ['-axo', 'pid=,ppid='], { cwd: root }),
            ]);
            return `${JSON.stringify(processes)}\n${commandsOutside(
                commands,
                ancestorPids(table, process.pid),
            )}\n${files}`;
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
function unexpectedEdits(status: string, kind: CleanupEntry['kind']): boolean {
    return status
        .split('\n')
        .some(
            (line) =>
                line &&
                !line.startsWith('!! ') &&
                !(
                    kind === 'tool' &&
                    line === '?? scripts/ldenv/index.bundle.cjs'
                ) &&
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
    if (worktree.locked || !worktree.detached)
        return result(false, 'Locked or branch worktree may belong to a user');
    if (references.includes(directory))
        return result(false, 'Referenced by a process or open file');
    if (unexpectedEdits(await io.status(directory), kind))
        return result(false, 'Worktree has user edits');
    return result(true, 'Unreferenced ldenv-owned detached worktree');
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
    );
    if (!checked.remove)
        throw new Error(
            `Warm worktree retained: ${instance.worktree}: ${checked.reason}`,
        );
    await io.remove(instance.worktree);
}
