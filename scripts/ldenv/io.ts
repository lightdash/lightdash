import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
    while (true) {
        try {
            await mkdir(lock);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            if (Date.now() >= deadline)
                throw new Error(
                    `ldenv is busy: ${name}. Inspect ${lock}/owner.json before removing a stale lock.`,
                );
            await delay(25);
            await yieldBeforeLock();
        }
    }
    try {
        await writeJson(path.join(lock, 'owner.json'), {
            pid: process.pid,
            startedAt: new Date().toISOString(),
        });
        return await sharedLock.run(
            shared || Boolean(sharedLock.getStore()),
            work,
        );
    } finally {
        await rm(lock, { recursive: true });
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
        Object.entries(env).forEach(([key, value]) => {
            if (
                /SECRET|PASSWORD|TOKEN|LICENSE|PRIVATE_KEY|API_KEY|LDPAT/.test(
                    key,
                ) &&
                value
            )
                this.secrets.add(value);
        });
    }
    redact(value: string): string {
        let result = value;
        this.secrets.forEach((secret) => {
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
