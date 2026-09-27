import { watchFile, unwatchFile } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createBackendBuilder, type BuildEvent } from './backend-bundle.cjs';
import { BundleChild } from './bundle-child';
import { bundleDirectory, type BundleState } from './bundle-state';
import { runner, writeJson } from './io';
import { instanceId } from './model';

async function main(): Promise<void> {
    const root = await realpath(process.env.LDENV_WORKTREE ?? process.cwd());
    const id = instanceId(root);
    if (process.env.LD_INSTANCE_ID !== id)
        throw new Error('Bundle runner instance does not own this worktree');
    runner.protect(
        Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
            ),
        ),
    );
    const outDir = bundleDirectory(id);
    const statusFile = path.join(outDir, 'status.json');
    const state: BundleState = {
        worktree: root,
        supervisorPid: process.pid,
        apiPid: null,
        state: 'building',
        error: null,
        generation: 0,
        launchedRevision: 0,
        buildMs: null,
        builtAt: null,
        apiStartedAt: null,
    };
    let closing = false;
    let externalChanged = false;
    let builder: Awaited<ReturnType<typeof createBackendBuilder>> | null = null;
    let queue = Promise.resolve();
    const sentinels = [
        'packages/common/dist/cjs/.tsbuildinfo',
        'packages/formula/dist/.tsbuildinfo',
        'packages/warehouses/dist/.tsbuildinfo',
    ].map((file) => path.join(root, file));
    const child = new BundleChild({
        executable: process.execPath,
        args: [
            '--enable-source-maps',
            ...(process.env.DEBUG_PORT
                ? [`--inspect=127.0.0.1:${process.env.DEBUG_PORT}`]
                : []),
            path.join(outDir, 'api.cjs'),
        ],
        cwd: path.join(root, 'packages/backend'),
        env: process.env,
        onExit: (code, signal) => {
            void close(
                1,
                `API exited (${signal ?? code}); PM2 will restart its supervisor`,
            );
        },
    });
    const publish = () => {
        state.apiPid = child.pid;
        return writeJson(statusFile, state);
    };
    const accept = async (event: BuildEvent) => {
        if (closing) return;
        if (!event.ok) {
            state.state = 'failed';
            state.error = runner.redact(event.errors.join('\n'));
            process.stderr.write(`${state.error}\n`);
            await publish();
            return;
        }
        state.generation = event.generation;
        state.buildMs = Math.round(event.seconds * 1000);
        state.builtAt = new Date().toISOString();
        if (
            !child.pid ||
            event.revision !== state.launchedRevision ||
            externalChanged
        ) {
            externalChanged = false;
            await child.stop();
            if (closing) return;
            await child.start();
            state.apiStartedAt = new Date().toISOString();
        }
        state.launchedRevision = event.revision;
        state.state = 'ready';
        state.error = null;
        await publish();
    };
    let pending: BuildEvent | null = null;
    const enqueue = (event: BuildEvent) => {
        pending = event;
        queue = queue.then(async () => {
            while (pending && !closing) {
                const latest = pending;
                pending = null;
                await accept(latest);
            }
        });
        void queue.catch((error: unknown) =>
            close(1, error instanceof Error ? error.message : String(error)),
        );
    };
    async function close(code: number, error: string | null = null) {
        if (closing) return;
        closing = true;
        sentinels.forEach((file) => unwatchFile(file));
        await builder?.dispose();
        await queue.catch(() => {});
        await child.stop();
        state.state = error ? 'failed' : 'stopped';
        state.error = error ? runner.redact(error) : null;
        await publish();
        process.exit(code);
    }
    process.once('SIGINT', () => void close(0));
    process.once('SIGTERM', () => void close(0));
    await publish();
    builder = await createBackendBuilder({ root, outDir, onBuild: enqueue });
    try {
        await builder.watch();
        for (const file of sentinels) {
            watchFile(file, { interval: 250 }, (current, previous) => {
                if (closing || current.mtimeMs === previous.mtimeMs) return;
                externalChanged = true;
                void builder!.rebuild().catch(() => {});
            });
        }
    } catch (error) {
        await queue;
        await close(1, error instanceof Error ? error.message : String(error));
    }
}

void main().catch((error: unknown) => {
    process.stderr.write(
        `ldenv bundle: ${runner.redact(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
});
