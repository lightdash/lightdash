import { existsSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { install } from './cache';
import { atomicWrite, git, home, withLock, writeJson } from './io';

const controlRoot = path.resolve(__dirname, '../..');
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function targetArguments(
    args: string[],
    fallback: string,
): {
    args: string[];
    worktree: string;
} {
    const index = args.indexOf('--worktree');
    if (index < 0) return { args, worktree: fallback };
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
        throw new Error('--worktree needs a path');
    return {
        args: args.filter(
            (_, position) => position !== index && position !== index + 1,
        ),
        worktree: path.resolve(value),
    };
}

export async function installLauncher(): Promise<string> {
    return withLock('tool-install', async () => {
        if (
            await git(controlRoot, [
                'diff',
                '--name-only',
                'HEAD',
                '--',
                'scripts/ldenv',
            ])
        )
            throw new Error(
                'Commit ldenv changes before installing the machine launcher',
            );
        const sha = await git(controlRoot, ['rev-parse', 'HEAD']);
        const directory = path.join(home, 'tools', sha.slice(0, 12));
        if (!existsSync(directory)) {
            await mkdir(path.dirname(directory), { recursive: true });
            await git(controlRoot, [
                'worktree',
                'add',
                '--detach',
                directory,
                sha,
            ]);
        }
        if ((await git(directory, ['rev-parse', 'HEAD'])) !== sha)
            throw new Error('Pinned tool checkout has an unexpected revision');
        if (!existsSync(path.join(directory, 'node_modules/.bin/tsx')))
            await install(directory, true, {}, 'tool-install');
        const loader = path.join(directory, 'node_modules/tsx/dist/loader.mjs');
        const entry = path.join(directory, 'scripts/ldenv/index.ts');
        if (!existsSync(loader) || !existsSync(entry))
            throw new Error('The pinned tool checkout is incomplete');
        const launcher = path.join(home, 'bin', 'ldenv');
        await atomicWrite(
            launcher,
            `#!/bin/sh\nexec ${shellQuote(process.execPath)} --import ${shellQuote(loader)} ${shellQuote(entry)} "$@"\n`,
        );
        await chmod(launcher, 0o755);
        await writeJson(path.join(home, 'tool.json'), {
            sha,
            directory,
            launcher,
            installedAt: new Date().toISOString(),
        });
        return launcher;
    });
}
