import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, hashFile, home, readJson, writeJson } from './io';
import {
    assertInstance,
    dotenvText,
    type Environment,
    type Instance,
} from './model';

type EnvBackup = {
    previous: string | null;
    writtenHash: string | null;
};

const pendingWrites = new Map<string, Promise<void>>();

function paths(instance: Instance) {
    assertInstance(instance);
    return {
        backup: path.join(home, 'env-backups', `${instance.id}.json`),
        file: path.join(instance.worktree, '.env.development.local'),
    };
}

export async function writeInstanceEnv(
    instance: Instance,
    env: Environment,
): Promise<void> {
    const { backup, file } = paths(instance);
    const content = dotenvText(env);
    const previous = pendingWrites.get(instance.id) ?? Promise.resolve();
    const pending = previous
        .catch(() => {})
        .then(async () => {
            let record: EnvBackup;
            if (existsSync(backup)) {
                record = await readJson<EnvBackup>(backup);
                if (
                    !existsSync(file) ||
                    !record.writtenHash ||
                    (await hashFile(file)) !== record.writtenHash
                )
                    throw new Error(
                        `Environment file changed outside ldenv; original retained at ${backup}`,
                    );
            } else {
                record = {
                    previous: existsSync(file)
                        ? await readFile(file, 'utf8')
                        : null,
                    writtenHash: null,
                };
                await writeJson(backup, record);
            }
            await atomicWrite(file, content);
            record.writtenHash = await hashFile(file);
            await writeJson(backup, record);
        });
    pendingWrites.set(instance.id, pending);
    try {
        await pending;
    } finally {
        if (pendingWrites.get(instance.id) === pending)
            pendingWrites.delete(instance.id);
    }
}

export async function writeTracingEnv(
    instance: Instance,
    env: Environment,
    tracing: string,
): Promise<void> {
    env.LDENV_TRACING = tracing;
    env.OTEL_SDK_DISABLED = tracing === 'true' ? 'false' : 'true';
    await writeInstanceEnv(instance, env);
}

export async function restoreInstanceEnv(
    instance: Instance,
): Promise<string | null> {
    const { backup, file } = paths(instance);
    if (!existsSync(backup)) return null;
    const original = await readJson<EnvBackup>(backup);
    if (
        !existsSync(file) ||
        !original.writtenHash ||
        (await hashFile(file)) !== original.writtenHash
    )
        return backup;
    if (original.previous === null) await rm(file);
    else await atomicWrite(file, original.previous);
    await rm(backup);
    return null;
}

export function inheritLicensePair(
    target: Environment,
    parent: Environment,
): void {
    if (target.LIGHTDASH_LICENSE_KEY || !parent.LIGHTDASH_LICENSE_KEY) return;
    target.LIGHTDASH_LICENSE_KEY = parent.LIGHTDASH_LICENSE_KEY;
    if (parent.LIGHTDASH_LICENSE_CERTIFICATE)
        target.LIGHTDASH_LICENSE_CERTIFICATE =
            parent.LIGHTDASH_LICENSE_CERTIFICATE;
}
