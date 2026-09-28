import { execFile } from 'node:child_process';
import { readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { json, type Instance } from './model';
import { processName } from './namespace';
import { pm2 } from './processes';

const execFileAsync = promisify(execFile);

export type ActivityProcess = {
    pid: number;
    ppid: number;
    command: string;
};

export type ActivityMatch = { pid: number; command: string };

type ActivityOperations = {
    processes: () => Promise<ActivityProcess[]>;
    pm2Roots: (instances: Instance[]) => Promise<number[]>;
    cwds: (pids: number[]) => Promise<Map<number, string>>;
    observerPid: number;
};

type ReferencesOperations = {
    processes: () => Promise<ActivityProcess[]>;
    pm2Roots: (instances: Instance[]) => Promise<number[]>;
    references: (pids: number[]) => Promise<Map<number, string[]>>;
    observerPid: number;
};

function inside(worktree: string, cwd: string): boolean {
    const relative = path.relative(worktree, cwd);
    return (
        relative === '' ||
        (relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative))
    );
}

function processTree(
    roots: Iterable<number>,
    rows: ActivityProcess[],
): Set<number> {
    const excluded = new Set(roots);
    const children = new Map<number, number[]>();
    for (const row of rows) {
        const siblings = children.get(row.ppid) ?? [];
        siblings.push(row.pid);
        children.set(row.ppid, siblings);
    }
    const pending = [...excluded];
    while (pending.length) {
        const parent = pending.pop()!;
        for (const child of children.get(parent) ?? []) {
            if (excluded.has(child)) continue;
            excluded.add(child);
            pending.push(child);
        }
    }
    return excluded;
}

function observerTree(pid: number, rows: ActivityProcess[]): Set<number> {
    const parents = new Map(rows.map((row) => [row.pid, row.ppid]));
    const excluded = processTree([pid], rows);
    let current = pid;
    while (parents.has(current)) {
        const parent = parents.get(current)!;
        if (parent <= 0 || excluded.has(parent)) break;
        excluded.add(parent);
        current = parent;
    }
    return excluded;
}

function isInternalCommand(command: string): boolean {
    const words = command.trim().split(/\s+/);
    const executable = path.basename(words[0] ?? '');
    if (['ldenv', 'git', 'lsof', 'ps', 'pgrep'].includes(executable))
        return true;
    if (['node', 'tsx'].includes(executable)) {
        for (let index = 1; index < words.length; index += 1) {
            if (
                ['--import', '--require', '-r', '--loader'].includes(
                    words[index],
                )
            ) {
                index += 1;
                continue;
            }
            if (['-e', '--eval', '-p', '--print'].includes(words[index])) break;
            if (words[index].startsWith('-')) continue;
            if (/(?:^|[\\/])scripts[\\/]ldenv[\\/]/.test(words[index]))
                return true;
            break;
        }
    }
    return /^(?:\S*\/)?(?:ba|z|k|fi)?sh\s+-c\s+(?:git|lsof|ps|pgrep)(?:\s|$)/.test(
        command,
    );
}

export function eligibleActivityProcesses(
    rows: ActivityProcess[],
    pm2Roots: number[],
    observerPid: number,
): ActivityProcess[] {
    const daemonRoots = rows
        .filter((row) => /^PM2 v\S+: God Daemon\b/.test(row.command))
        .map((row) => row.pid);
    const internalRoots = rows
        .filter((row) => isInternalCommand(row.command))
        .map((row) => row.pid);
    const excluded = processTree(
        [...pm2Roots, ...daemonRoots, ...internalRoots],
        rows,
    );
    for (const pid of observerTree(observerPid, rows)) excluded.add(pid);
    return rows.filter((row) => !excluded.has(row.pid));
}

export function activityFromSnapshot(
    instances: Instance[],
    rows: ActivityProcess[],
    cwdByPid: ReadonlyMap<number, string>,
    pm2Roots: number[],
    observerPid: number,
): Map<string, ActivityMatch> {
    return matchesFromSnapshot(
        instances,
        rows,
        (pid) => {
            const cwd = cwdByPid.get(pid);
            return cwd ? [cwd] : [];
        },
        pm2Roots,
        observerPid,
    );
}

export function referencesFromSnapshot(
    instances: Instance[],
    rows: ActivityProcess[],
    referencesByPid: ReadonlyMap<number, string[]>,
    pm2Roots: number[],
    observerPid: number,
): Map<string, ActivityMatch> {
    return matchesFromSnapshot(
        instances,
        rows,
        (pid) => referencesByPid.get(pid) ?? [],
        pm2Roots,
        observerPid,
    );
}

function matchesFromSnapshot(
    instances: Instance[],
    rows: ActivityProcess[],
    pathsForPid: (pid: number) => readonly string[],
    pm2Roots: number[],
    observerPid: number,
): Map<string, ActivityMatch> {
    const matches = new Map<string, ActivityMatch>();
    const ordered = [...instances].sort(
        (left, right) => right.worktree.length - left.worktree.length,
    );
    for (const row of eligibleActivityProcesses(rows, pm2Roots, observerPid)) {
        for (const reference of pathsForPid(row.pid)) {
            if (!path.isAbsolute(reference)) continue;
            const instance = ordered.find((item) =>
                inside(item.worktree, reference),
            );
            if (instance && !matches.has(instance.id))
                matches.set(instance.id, {
                    pid: row.pid,
                    command: row.command,
                });
        }
    }
    return matches;
}

async function listProcesses(): Promise<ActivityProcess[]> {
    const { stdout } = await execFileAsync(
        'ps',
        ['-axo', 'pid=,ppid=,command='],
        { timeout: 1000, maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout.split('\n').flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        return match
            ? [
                  {
                      pid: Number(match[1]),
                      ppid: Number(match[2]),
                      command: match[3],
                  },
              ]
            : [];
    });
}

let pm2Cache: {
    key: string;
    expires: number;
    roots: Promise<number[]>;
} | null = null;

async function listPm2Roots(instances: Instance[]): Promise<number[]> {
    const key = instances
        .map((instance) => `${instance.id}:${instance.worktree}`)
        .sort()
        .join('\n');
    if (pm2Cache?.key === key && pm2Cache.expires > Date.now())
        return pm2Cache.roots;
    const roots = (async () => {
        const output = await pm2(['jlist']);
        const start = output.search(/\[\s*(?:\{|\])/);
        if (start < 0) throw new Error('PM2 inventory is not JSON');
        const entries = json<
            {
                name: string;
                pid: number;
                pm2_env: { pm_cwd: string };
            }[]
        >(output.slice(start));
        return entries
            .filter((entry) =>
                instances.some(
                    (instance) =>
                        entry.name.startsWith(processName(instance.id, '')) &&
                        inside(instance.worktree, entry.pm2_env.pm_cwd),
                ),
            )
            .map((entry) => entry.pid)
            .filter((pid) => Number.isInteger(pid) && pid > 0);
    })();
    pm2Cache = { key, expires: Date.now() + 2000, roots };
    try {
        return await roots;
    } catch (error) {
        if (pm2Cache?.roots === roots) pm2Cache = null;
        throw error;
    }
}

async function linuxCwds(pids: number[]): Promise<Map<number, string>> {
    const values = await Promise.all(
        pids.map(async (pid) => {
            try {
                return [pid, await readlink(`/proc/${pid}/cwd`)] as const;
            } catch {
                return null;
            }
        }),
    );
    return new Map(values.filter((value) => value !== null));
}

async function macCwds(pids: number[]): Promise<Map<number, string>> {
    if (!pids.length) return new Map();
    let stdout: string;
    try {
        ({ stdout } = await execFileAsync(
            'lsof',
            ['-nP', '-a', '-d', 'cwd', '-p', pids.join(','), '-Fpfn'],
            { timeout: 1000, maxBuffer: 8 * 1024 * 1024 },
        ));
    } catch (error) {
        if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error) ||
            error.code !== 1 ||
            !('stdout' in error) ||
            typeof error.stdout !== 'string'
        )
            throw error;
        stdout = error.stdout;
    }
    return new Map(
        [...parseLsofPaths(stdout, true)].flatMap(([pid, paths]) =>
            paths[0] ? [[pid, paths[0]] as const] : [],
        ),
    );
}

export function parseLsofPaths(
    output: string,
    cwdOnly = false,
): Map<number, string[]> {
    const values = new Map<number, string[]>();
    let pid = 0;
    let descriptor = '';
    for (const line of output.split('\n')) {
        if (line.startsWith('p')) {
            pid = Number(line.slice(1));
            descriptor = '';
        } else if (line.startsWith('f')) descriptor = line.slice(1);
        else if (line.startsWith('n') && pid > 0) {
            const reference = line.slice(1);
            if (
                !path.isAbsolute(reference) ||
                (cwdOnly && descriptor !== 'cwd')
            )
                continue;
            const paths = values.get(pid) ?? [];
            paths.push(reference);
            values.set(pid, paths);
        }
    }
    return values;
}

async function openFileReferences(
    pids: number[],
): Promise<Map<number, string[]>> {
    if (!pids.length) return new Map();
    let stdout: string;
    try {
        ({ stdout } = await execFileAsync(
            'lsof',
            ['-nP', '-p', pids.join(','), '-Fpfn'],
            { timeout: 5000, maxBuffer: 32 * 1024 * 1024 },
        ));
    } catch (error) {
        if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error) ||
            error.code !== 1 ||
            !('stdout' in error) ||
            typeof error.stdout !== 'string' ||
            error.stdout.trim() !== '' ||
            !('stderr' in error) ||
            typeof error.stderr !== 'string' ||
            error.stderr.trim() !== ''
        )
            throw error;
        stdout = '';
    }
    return parseLsofPaths(stdout);
}

const defaultOperations: ActivityOperations = {
    processes: listProcesses,
    pm2Roots: listPm2Roots,
    cwds: process.platform === 'darwin' ? macCwds : linuxCwds,
    observerPid: process.pid,
};

const defaultReferencesOperations: ReferencesOperations = {
    processes: listProcesses,
    pm2Roots: listPm2Roots,
    references: openFileReferences,
    observerPid: process.pid,
};

async function resolveWorktrees(instances: Instance[]): Promise<Instance[]> {
    return Promise.all(
        instances.map(async (instance) => ({
            ...instance,
            worktree: await realpath(instance.worktree).catch(
                () => instance.worktree,
            ),
        })),
    );
}

export async function readyActivity(
    instances: Instance[],
    operations: ActivityOperations = defaultOperations,
): Promise<Map<string, ActivityMatch>> {
    if (!instances.length) return new Map();
    const rootsPromise = operations.pm2Roots(instances);
    const [rows, resolved] = await Promise.all([
        operations.processes(),
        resolveWorktrees(instances),
    ]);
    const eligible = eligibleActivityProcesses(
        rows,
        [],
        operations.observerPid,
    );
    const [roots, cwds] = await Promise.all([
        rootsPromise,
        operations.cwds(eligible.map((row) => row.pid)),
    ]);
    return activityFromSnapshot(
        resolved,
        rows,
        cwds,
        roots,
        operations.observerPid,
    );
}

export async function readyReferences(
    instances: Instance[],
    operations: ReferencesOperations = defaultReferencesOperations,
): Promise<Map<string, ActivityMatch>> {
    if (!instances.length) return new Map();
    const [rows, roots, resolved] = await Promise.all([
        operations.processes(),
        operations.pm2Roots(instances),
        resolveWorktrees(instances),
    ]);
    const eligible = eligibleActivityProcesses(
        rows,
        roots,
        operations.observerPid,
    );
    const references = await operations.references(
        eligible.map((row) => row.pid),
    );
    return referencesFromSnapshot(
        resolved,
        rows,
        references,
        roots,
        operations.observerPid,
    );
}
