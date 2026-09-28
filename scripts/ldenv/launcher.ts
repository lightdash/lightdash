import { existsSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { install } from './cache';
import { dotenv } from './infra';
import {
    atomicWrite,
    backgroundWork,
    git,
    home,
    listJson,
    readJson,
    runner,
    withLock,
    writeJson,
} from './io';
import type { Parent } from './model';
import type { ViteCacheReport } from './vite-cache';

const controlRoot = path.resolve(__dirname, '../..');
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function launcherScript(
    executable: string,
    bundle: string,
    loader: string,
    entry: string,
): string {
    return `#!/bin/sh\nif [ -f ${shellQuote(bundle)} ]; then\n    exec ${shellQuote(executable)} ${shellQuote(bundle)} "$@"\nfi\nexec ${shellQuote(executable)} --import ${shellQuote(loader)} ${shellQuote(entry)} "$@"\n`;
}

export async function bundleLauncher(
    directory: string,
    entry: string,
    bundle: string,
): Promise<void> {
    const requireTool = createRequire(path.join(directory, 'package.json'));
    const requireTsx = createRequire(requireTool.resolve('tsx'));
    const esbuild = requireTsx('esbuild') as {
        build: (options: Record<string, unknown>) => Promise<void>;
    };
    await esbuild.build({
        entryPoints: [entry],
        outfile: bundle,
        bundle: true,
        packages: 'external',
        platform: 'node',
        format: 'cjs',
        target: 'node24',
        minify: true,
        logLevel: 'silent',
    });
}

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

async function refreshParentCaches(
    directory: string,
    executable: string,
    sha: string,
): Promise<void> {
    await backgroundWork(() =>
        withLock('parent-build', async () => {
            const manifestDirectory = path.join(home, 'manifests');
            for (const parent of await listJson<Parent>(manifestDirectory)) {
                if (!existsSync(parent.path)) continue;
                const started = Date.now();
                const output = await runner.run(
                    executable,
                    [
                        path.join(directory, 'scripts/ldenv/vite-launcher.cjs'),
                        'populate',
                        parent.path,
                    ],
                    {
                        cwd: parent.path,
                        env: {
                            ...(await dotenv(
                                path.join(
                                    parent.path,
                                    '.env.development.local',
                                ),
                            )),
                            NODE_ENV: 'development',
                        },
                    },
                );
                const line = output
                    .split('\n')
                    .findLast((value) =>
                        value.startsWith('LDENV_VITE_RESULT='),
                    );
                if (!line)
                    throw new Error(
                        'Installed Vite cache helper did not return a result',
                    );
                const result = JSON.parse(
                    line.slice('LDENV_VITE_RESULT='.length),
                ) as ViteCacheReport;
                parent.viteCache = { ...result, toolSha: sha };
                parent.timings.viteCachePopulate = Date.now() - started;
                await withLock('parents', () =>
                    writeJson(
                        path.join(manifestDirectory, `${parent.sha}.json`),
                        parent,
                    ),
                );
                process.stdout.write(
                    `PARENT VITE CACHE ${parent.sha.slice(0, 12)}: ${JSON.stringify(parent.viteCache)}\n`,
                );
            }
        }),
    );
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
        const bundle = path.join(directory, 'scripts/ldenv/index.bundle.cjs');
        const executable = path.join(directory, 'node_modules/node/bin/node');
        if (
            !existsSync(loader) ||
            !existsSync(entry) ||
            !existsSync(executable)
        )
            throw new Error('The pinned tool checkout is incomplete');
        await bundleLauncher(directory, entry, bundle);
        await refreshParentCaches(directory, executable, sha);
        const launcher = path.join(home, 'bin', 'ldenv');
        await atomicWrite(
            launcher,
            launcherScript(executable, bundle, loader, entry),
        );
        await chmod(launcher, 0o755);
        const recordFile = path.join(home, 'tool.json');
        const previous = existsSync(recordFile)
            ? await readJson<{
                  directory: string;
                  previousDirectory?: string | null;
              }>(recordFile)
            : null;
        await writeJson(recordFile, {
            previousDirectory:
                previous?.directory === directory
                    ? (previous.previousDirectory ?? null)
                    : (previous?.directory ?? null),
            sha,
            directory,
            launcher,
            installedAt: new Date().toISOString(),
        });
        return launcher;
    });
}
