import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
    lstat,
    mkdir,
    readFile,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { json, type Environment, type Instance } from './model';

export const home = process.env.LDENV_HOME ?? path.join(os.homedir(), '.ldenv');
export const statePath = (id: string) =>
    path.join(home, 'instances', `${id}.json`);
export async function readJson<T>(file: string): Promise<T> {
    return json<T>(await readFile(file, 'utf8'));
}
export async function atomicWrite(
    file: string,
    content: string,
): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, file);
}
export const writeJson = (file: string, value: unknown) =>
    atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
export async function saveInstance(instance: Instance): Promise<void> {
    instance.updatedAt = new Date().toISOString();
    await writeJson(statePath(instance.id), instance);
}
const sharedLock = new AsyncLocalStorage<boolean>();
const execFileAsync = promisify(execFile);
const staleLockGraceMs = 3000;
type LockOwner = {
    id?: string;
    pid: number;
    startedAt: string;
    processStart?: string | null;
    commandHash?: string | null;
};
type LockSnapshot = {
    dev: number;
    ino: number;
    rawOwner: string | null;
    owner: LockOwner | null;
    modifiedAt: number;
};
async function processIdentity(
    pid: number,
): Promise<{ start: string; command: string } | null> {
    try {
        const { stdout } = await execFileAsync(
            'ps',
            ['-p', String(pid), '-o', 'lstart=', '-o', 'command='],
            { timeout: 1000 },
        );
        const match = stdout.match(
            /^\s*(\w{3}\s+\w{3}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/m,
        );
        return match ? { start: match[1], command: match[2] } : null;
    } catch {
        return null;
    }
}
let ownProcessIdentity: Promise<{
    start: string;
    command: string;
} | null> | null = null;
function currentProcessIdentity() {
    ownProcessIdentity ??= processIdentity(process.pid);
    return ownProcessIdentity;
}
function commandHash(command: string): string {
    return createHash('sha256').update(command).digest('hex');
}
async function reclaimGuard(
    lock: string,
): Promise<{ release: () => Promise<void> } | null> {
    const script = [
        'import fcntl, os, sys',
        'fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR, 0o600)',
        'try:',
        '    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)',
        'except BlockingIOError:',
        '    print("BUSY", flush=True)',
        '    sys.exit(0)',
        'print("LOCKED", flush=True)',
        'sys.stdin.buffer.read()',
    ].join('\n');
    const child = spawn(
        'python3',
        ['-u', '-c', script, `${lock}.reclaim-guard`],
        {
            stdio: ['pipe', 'pipe', 'pipe'],
        },
    );
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
    });
    const exited = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
    });
    void exited.catch(() => {});
    let status: string;
    try {
        status = await new Promise<string>((resolve, reject) => {
            let output = '';
            const timer = setTimeout(
                () => reject(new Error('guard startup timed out')),
                2000,
            );
            const finish = (result: string | Error) => {
                clearTimeout(timer);
                if (result instanceof Error) reject(result);
                else resolve(result);
            };
            child.stdout.on('data', (data: Buffer) => {
                output += data.toString();
                const line = output.indexOf('\n');
                if (line >= 0) finish(output.slice(0, line));
            });
            child.once('error', (error) => finish(error));
            child.once('exit', (code) =>
                finish(
                    new Error(
                        `guard exited (${code ?? 'signal'}): ${stderr.trim()}`,
                    ),
                ),
            );
        });
    } catch (error) {
        child.stdin.destroy();
        if (child.pid) child.kill('SIGKILL');
        await exited.catch(() => {});
        throw new Error(
            `python3 is required to inspect a contended ldenv lock: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (status === 'BUSY') {
        child.stdin.end();
        await exited;
        return null;
    }
    if (status !== 'LOCKED') {
        child.stdin.end();
        await exited;
        throw new Error(`Invalid python3 reclaim guard response: ${status}`);
    }
    return {
        release: async () => {
            child.stdin.end();
            const code = await exited;
            if (code !== 0)
                throw new Error(
                    `python3 reclaim guard failed (${code ?? 'signal'}): ${stderr.trim()}`,
                );
        },
    };
}
function sameLock(a: LockSnapshot, b: LockSnapshot): boolean {
    return a.dev === b.dev && a.ino === b.ino && a.rawOwner === b.rawOwner;
}
async function lockSnapshot(lock: string): Promise<LockSnapshot | null> {
    let before;
    try {
        before = await lstat(lock);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
    if (!before.isDirectory())
        throw new Error(`Lock path is not a directory: ${lock}`);
    let rawOwner: string | null = null;
    try {
        rawOwner = await readFile(path.join(lock, 'owner.json'), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const after = await lstat(lock).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (!after || before.dev !== after.dev || before.ino !== after.ino)
        return null;
    let owner: LockOwner | null = null;
    if (rawOwner !== null) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawOwner);
        } catch {
            throw new Error(`Lock owner record is invalid: ${lock}/owner.json`);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error(`Lock owner record is invalid: ${lock}/owner.json`);
        owner = parsed as LockOwner;
        if (
            !Number.isSafeInteger(owner.pid) ||
            owner.pid < 1 ||
            typeof owner.startedAt !== 'string' ||
            !Number.isFinite(Date.parse(owner.startedAt))
        )
            throw new Error(`Lock owner record is invalid: ${lock}/owner.json`);
    }
    return {
        dev: before.dev,
        ino: before.ino,
        rawOwner,
        owner,
        modifiedAt: before.mtimeMs,
    };
}
function pidAlive(pid: number): boolean | null {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        if ((error as NodeJS.ErrnoException).code === 'EPERM') return true;
        return null;
    }
}
async function reclaimCandidate(
    lock: string,
): Promise<{ snapshot: LockSnapshot | null; reason: string | null }> {
    const snapshot = await lockSnapshot(lock);
    if (!snapshot) return { snapshot: null, reason: null };
    const acquiredAt = snapshot.owner
        ? Date.parse(snapshot.owner.startedAt)
        : snapshot.modifiedAt;
    if (Date.now() - acquiredAt < staleLockGraceMs)
        return { snapshot, reason: 'lock is too new to reclaim' };
    if (snapshot.owner) {
        const live = pidAlive(snapshot.owner.pid);
        if (live === null)
            return { snapshot, reason: 'cannot verify lock owner' };
        if (live) {
            const current = await processIdentity(snapshot.owner.pid);
            if (!current)
                return { snapshot, reason: 'cannot verify lock owner' };
            if (snapshot.owner.processStart) {
                if (current.start === snapshot.owner.processStart) {
                    return {
                        snapshot,
                        reason:
                            commandHash(current.command) ===
                            snapshot.owner.commandHash
                                ? `pid ${snapshot.owner.pid} is still running`
                                : 'cannot verify lock owner command',
                    };
                }
            } else {
                const processStart = Date.parse(current.start);
                if (!Number.isFinite(processStart))
                    return {
                        snapshot,
                        reason: 'cannot verify lock owner start time',
                    };
                if (processStart <= acquiredAt + 1000)
                    return {
                        snapshot,
                        reason: `pid ${snapshot.owner.pid} may still own the lock`,
                    };
            }
        }
    }
    return { snapshot, reason: null };
}
async function reclaimLock(lock: string): Promise<string | null> {
    const preliminary = await reclaimCandidate(lock);
    if (preliminary.reason || !preliminary.snapshot) return preliminary.reason;
    const guard = await reclaimGuard(lock);
    if (!guard) return 'another lock reclaimer is active';
    try {
        const guarded = await reclaimCandidate(lock);
        if (guarded.reason || !guarded.snapshot) return guarded.reason;
        const snapshot = guarded.snapshot;
        const latest = await lockSnapshot(lock);
        if (!latest || !sameLock(snapshot, latest)) return null;
        const retired = `${lock}.stale-${process.pid}-${randomUUID()}`;
        try {
            await rename(lock, retired);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
        const moved = await lockSnapshot(retired);
        if (!moved || !sameLock(snapshot, moved))
            throw new Error(
                `Lock changed during reclamation; inspect ${retired} before recovery`,
            );
        await rm(retired, { recursive: true });
        return null;
    } finally {
        await guard.release();
    }
}
export async function withLock<T>(
    name: string,
    work: () => Promise<T>,
    options: { timeoutMs?: number | null; yieldToForeground?: boolean } = {},
): Promise<T> {
    const lock = path.join(home, 'locks', name);
    await mkdir(path.dirname(lock), { recursive: true, mode: 0o700 });
    const shared = ['postgres', 'parents', 'pool'].includes(name);
    const yieldBeforeLock = () =>
        options.yieldToForeground === false
            ? Promise.resolve()
            : yieldToForeground();
    await yieldBeforeLock();
    const deadline =
        options.timeoutMs === null
            ? Infinity
            : Date.now() + (options.timeoutMs ?? (shared ? 60000 : 0));
    let busyReason = 'lock is held';
    while (true) {
        try {
            await mkdir(lock);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            busyReason = (await reclaimLock(lock)) ?? 'lock changed; retry';
            if (busyReason === 'lock changed; retry') continue;
            if (Date.now() >= deadline)
                throw new Error(
                    `ldenv is busy: ${name}. ${busyReason}; inspect ${lock}/owner.json.`,
                );
            await delay(25);
            await yieldBeforeLock();
        }
    }
    const acquired = await lockSnapshot(lock);
    if (!acquired) throw new Error(`New lock disappeared: ${lock}`);
    const identity = await currentProcessIdentity();
    const owner: LockOwner = {
        id: randomUUID(),
        pid: process.pid,
        startedAt: new Date().toISOString(),
        processStart: identity?.start ?? null,
        commandHash: identity ? commandHash(identity.command) : null,
    };
    const release = async () => {
        const current = await lockSnapshot(lock);
        if (
            !current ||
            current.dev !== acquired.dev ||
            current.ino !== acquired.ino ||
            current.owner?.id !== owner.id
        )
            throw new Error(`Lock ownership changed before release: ${lock}`);
        const released = `${lock}.released-${process.pid}-${randomUUID()}`;
        await rename(lock, released);
        const moved = await lockSnapshot(released);
        if (!moved || !sameLock(current, moved))
            throw new Error(
                `Lock changed during release; inspect ${released} before recovery`,
            );
        await rm(released, { recursive: true });
    };
    try {
        await writeJson(path.join(lock, 'owner.json'), owner);
        const verified = await lockSnapshot(lock);
        if (
            !verified ||
            verified.dev !== acquired.dev ||
            verified.ino !== acquired.ino ||
            verified.owner?.id !== owner.id
        )
            throw new Error(`Lock ownership changed before work: ${lock}`);
        return await sharedLock.run(
            shared || Boolean(sharedLock.getStore()),
            work,
        );
    } finally {
        await release();
    }
}
const priority = new AsyncLocalStorage<'foreground' | 'background'>();
export const backgroundWork = <T>(work: () => Promise<T>): Promise<T> =>
    priority.run('background', work);
export async function foregroundWork<T>(work: () => Promise<T>): Promise<T> {
    if (priority.getStore()) return work();
    const file = path.join(
        home,
        'foreground',
        `${process.pid}-${randomUUID()}.json`,
    );
    await writeJson(file, { pid: process.pid });
    try {
        return await priority.run('foreground', work);
    } finally {
        await rm(file, { force: true });
    }
}
export async function foregroundActive(): Promise<boolean> {
    const leases = await listJson<{ pid: number }>(
        path.join(home, 'foreground'),
    );
    if (leases.some((lease) => alive(lease.pid))) return true;
    const instances = await listJson<Instance>(path.join(home, 'instances'));
    return instances.some(
        (instance) =>
            instance.kind !== 'warming' &&
            instance.kind !== 'spare' &&
            (instance.phase === 'starting' || instance.phase === 'preparing') &&
            alive(instance.monitorPid),
    );
}
export async function yieldToForeground(): Promise<void> {
    if (priority.getStore() !== 'background' || sharedLock.getStore()) return;
    let announced = false;
    while (await foregroundActive()) {
        if (!announced)
            process.stdout.write('WAIT: foreground instance is starting\n');
        announced = true;
        await delay(250);
    }
}
export type CommandOptions = {
    cwd: string;
    env?: Environment;
    input?: string;
    log?: string;
    timeout?: number;
};
export class Runner {
    private secrets = new Set<string>();
    protect(env: Environment): void {
        const genuine = (value: string) => {
            const normalized = value.trim();
            return (
                normalized.length >= 8 &&
                ![
                    'password',
                    'dummy-build-key',
                    'ldpat_deadbeefdeadbeefdeadbeefdeadbeef',
                    'undefined',
                ].includes(normalized) &&
                !['[]', '{}'].includes(normalized)
            );
        };
        Object.entries(env).forEach(([key, value]) => {
            if (key === 'LIGHTDASH_SECRET_FALLBACKS') {
                try {
                    const fallbacks: unknown = JSON.parse(value);
                    if (Array.isArray(fallbacks))
                        fallbacks.forEach((fallback: unknown) => {
                            if (
                                typeof fallback === 'string' &&
                                genuine(fallback)
                            )
                                this.secrets.add(fallback);
                        });
                } catch {
                    if (genuine(value)) this.secrets.add(value);
                }
            }
            if (
                (/(?:^|_)(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|LICENSE_KEY|LICENSE_CERTIFICATE|ACCESS_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|SECRET_KEY|WRITE_KEY)$/.test(
                    key,
                ) ||
                    key === 'PGPASSWORD' ||
                    key === 'LDPAT' ||
                    key === 'LIGHTDASH_SECRET_FALLBACKS') &&
                genuine(value)
            )
                this.secrets.add(value);
        });
    }
    redact(value: string): string {
        let result = value;
        [...this.secrets]
            .sort((a, b) => b.length - a.length)
            .forEach((secret) => {
                result = result.split(secret).join('[REDACTED]');
            });
        return result;
    }
    async run(
        command: string,
        args: string[],
        options: CommandOptions,
    ): Promise<string> {
        this.protect(options.env ?? {});
        await yieldToForeground();
        if (priority.getStore() === 'background') {
            args = ['-n', '10', command, ...args];
            command = 'nice';
            if (process.platform === 'darwin') {
                args = ['-b', command, ...args];
                command = '/usr/sbin/taskpolicy';
            }
        }
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                cwd: options.cwd,
                env: {
                    ...process.env,
                    ...options.env,
                    RUDDERSTACK_ANALYTICS_DISABLED: 'true',
                },
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });
            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });
            const timer = setTimeout(
                () => child.kill('SIGTERM'),
                options.timeout ?? 30 * 60 * 1000,
            );
            child.on('error', (error) => {
                clearTimeout(timer);
                reject(new Error(this.redact(error.message)));
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                const output = this.redact(`${stdout}\n${stderr}`);
                const finish = options.log
                    ? atomicWrite(options.log, output)
                    : Promise.resolve();
                finish.then(
                    () =>
                        code === 0
                            ? resolve(stdout.trimEnd())
                            : reject(
                                  new Error(
                                      `${command} failed (${code ?? 'signal'}): ${this.redact(stderr).slice(-1800)}${options.log ? `; log: ${options.log}` : ''}`,
                                  ),
                              ),
                    reject,
                );
            });
            child.stdin.on('error', () => undefined);
            child.stdin.end(options.input);
        });
    }
    async shell(script: string, options: CommandOptions): Promise<string> {
        return this.run(
            '/bin/bash',
            ['-e', '-o', 'pipefail', '-c', script],
            options,
        );
    }
}
export const runner = new Runner();
export async function git(cwd: string, args: string[]): Promise<string> {
    return runner.run('git', args, { cwd });
}
export async function hashFile(file: string): Promise<string> {
    return createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
}
export async function waitUntil(
    check: () => Promise<boolean>,
    timeout: number,
    label: string,
): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await delay(500);
    }
    throw new Error(`Timed out waiting for ${label}`);
}
export function alive(pid: number | null): boolean {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
export async function listJson<T>(directory: string): Promise<T[]> {
    if (!existsSync(directory)) return [];
    const { readdir } = await import('node:fs/promises');
    const values = await Promise.all(
        (await readdir(directory))
            .filter((name) => name.endsWith('.json'))
            .map(async (name) =>
                readJson<T>(path.join(directory, name)).catch(
                    (error: NodeJS.ErrnoException) => {
                        if (error.code === 'ENOENT') return null;
                        throw error;
                    },
                ),
            ),
    );
    return values.filter((value): value is Awaited<T> => value !== null);
}
