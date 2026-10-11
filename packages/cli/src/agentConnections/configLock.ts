import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { hostname } from 'os';
import path from 'path';

export const isFsError = (error: unknown, code: string): boolean =>
    error instanceof Error && 'code' in error && error.code === code;

export const privateDirectory = async (directory: string): Promise<void> => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await fs.chmod(directory, 0o700);
};

export const readPrivateFile = async (file: string): Promise<string | null> => {
    try {
        if (process.platform !== 'win32') await fs.chmod(file, 0o600);
        return await fs.readFile(file, 'utf8');
    } catch (error) {
        if (isFsError(error, 'ENOENT')) return null;
        throw new Error('Cannot read the agent connection file.');
    }
};

type LockOwner = {
    ownerId: string;
    pid: number;
    host: string;
    startedAt: string;
};
const readOwner = async (file: string): Promise<LockOwner | null> => {
    const contents = await readPrivateFile(file);
    if (contents === null) return null;
    try {
        const value: unknown = JSON.parse(contents);
        if (
            typeof value !== 'object' ||
            value === null ||
            !('ownerId' in value) ||
            typeof value.ownerId !== 'string' ||
            !value.ownerId ||
            !('pid' in value) ||
            typeof value.pid !== 'number' ||
            !Number.isInteger(value.pid) ||
            value.pid <= 0 ||
            !('host' in value) ||
            typeof value.host !== 'string' ||
            !('startedAt' in value) ||
            typeof value.startedAt !== 'string' ||
            !Number.isFinite(Date.parse(value.startedAt))
        )
            return null;
        return {
            ownerId: value.ownerId,
            pid: value.pid,
            host: value.host,
            startedAt: value.startedAt,
        };
    } catch {
        return null;
    }
};
const isDeadLocalOwner = (owner: LockOwner): boolean => {
    if (owner.host !== hostname()) return false;
    try {
        process.kill(owner.pid, 0);
        return false;
    } catch (error) {
        return isFsError(error, 'ESRCH');
    }
};
const exists = async (file: string): Promise<boolean> => {
    try {
        await fs.stat(file);
        return true;
    } catch (error) {
        if (isFsError(error, 'ENOENT')) return false;
        throw error;
    }
};
const releaseOwner = async (file: string, ownerId: string): Promise<void> => {
    if ((await readOwner(file))?.ownerId === ownerId) await fs.unlink(file);
};
const createOwner = async (file: string): Promise<LockOwner | null> => {
    let handle;
    try {
        handle = await fs.open(file, 'wx', 0o600);
    } catch (error) {
        if (isFsError(error, 'EEXIST')) return null;
        throw new Error('Cannot lock the agent connection file.');
    }
    const owner = {
        ownerId: randomUUID(),
        pid: process.pid,
        host: hostname(),
        startedAt: new Date().toISOString(),
    };
    try {
        await handle.writeFile(JSON.stringify(owner));
        await handle.sync();
    } finally {
        await handle.close();
    }
    return owner;
};

export const acquireLock = async (
    file: string,
    options: { waitMs: number; pollMs: number } = {
        waitMs: 30_000,
        pollMs: 25,
    },
): Promise<() => Promise<void>> => {
    await privateDirectory(path.dirname(file));
    const recovery = `${file}.recovery`;
    const deadline = performance.now() + options.waitMs;
    const attempt = async (): Promise<(() => Promise<void>) | null> => {
        if (!(await exists(recovery))) {
            const owner = await createOwner(file);
            if (owner) {
                if (!(await exists(recovery)))
                    return () => releaseOwner(file, owner.ownerId);
                await releaseOwner(file, owner.ownerId);
            } else {
                const stale = await readOwner(file);
                if (stale && isDeadLocalOwner(stale)) {
                    const sentinel = await createOwner(recovery);
                    if (sentinel) {
                        try {
                            const current = await readOwner(file);
                            if (
                                current?.ownerId === stale.ownerId &&
                                isDeadLocalOwner(current)
                            )
                                await fs.unlink(file);
                        } finally {
                            await releaseOwner(recovery, sentinel.ownerId);
                        }
                    }
                }
            }
        }
        await new Promise<void>((resolve) => {
            setTimeout(
                resolve,
                options.pollMs + Math.floor(Math.random() * options.pollMs),
            );
        });
        return performance.now() < deadline ? attempt() : null;
    };
    const release = await attempt();
    if (release !== null) return release;
    if (await exists(recovery))
        throw new Error(
            'Interrupted config lock recovery. Confirm no CLI process is using this config before removing the recovery sentinel.',
        );
    throw new Error(
        'Another CLI process is updating this connection. Try again shortly.',
    );
};

export const atomicWrite = async (
    file: string,
    contents: string,
    commit: { beforeCommit?: () => void; onCommitted?: () => void } = {},
): Promise<void> => {
    await privateDirectory(path.dirname(file));
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
        try {
            await handle.writeFile(contents);
            await handle.sync();
        } finally {
            await handle.close();
        }
        commit.beforeCommit?.();
        await fs.rename(temporary, file);
        commit.onCommitted?.();
        if (process.platform !== 'win32') {
            const directory = await fs.open(path.dirname(file), 'r');
            try {
                await directory.sync();
            } finally {
                await directory.close();
            }
        }
    } finally {
        await fs.unlink(temporary).catch((error: unknown) => {
            if (!isFsError(error, 'ENOENT'))
                throw new Error('Cannot clean up the agent connection file.');
        });
    }
};
