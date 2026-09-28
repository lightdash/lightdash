import { watchFile, unwatchFile } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createBackendBuilder, type BuildEvent } from './backend-bundle.cjs';
import { BundleChild } from './bundle-child';
import { bundleDirectory, type BundleState } from './bundle-state';
import { runner, writeJson } from './io';
import { instanceId } from './model';

export class BundleSupervisor {
    private closing = false;
    private externalChanged = false;
    private queue = Promise.resolve();

    constructor(
        readonly state: BundleState,
        private readonly child: Pick<BundleChild, 'pid' | 'start' | 'stop'>,
        private readonly publish: (state: BundleState) => Promise<void>,
        private readonly redact: (value: string) => string = (value) => value,
    ) {}

    private write(): Promise<void> {
        this.state.apiPid = this.child.pid;
        return this.publish({ ...this.state });
    }

    private enqueue(work: () => Promise<void>): Promise<void> {
        this.queue = this.queue.then(async () => {
            if (!this.closing) await work();
        });
        return this.queue;
    }

    buildStarted(): Promise<void> {
        return this.enqueue(async () => {
            this.state.state = 'building';
            await this.write();
        });
    }

    invalidate(): void {
        this.externalChanged = true;
    }

    buildFinished(event: BuildEvent): Promise<void> {
        return this.enqueue(async () => {
            if (!event.ok) {
                this.state.state = 'failed';
                this.state.error = this.redact(event.errors.join('\n'));
                await this.write();
                return;
            }
            if (
                !this.child.pid ||
                event.revision !== this.state.launchedRevision ||
                this.externalChanged
            ) {
                this.externalChanged = false;
                await this.child.stop();
                if (this.closing) return;
                await this.child.start();
                this.state.apiStartedAt = new Date().toISOString();
            }
            if (this.closing) return;
            this.state.generation = event.generation;
            this.state.buildMs = Math.round(event.seconds * 1000);
            this.state.builtAt = new Date().toISOString();
            this.state.launchedRevision = event.revision;
            this.state.state = 'ready';
            this.state.error = null;
            await this.write();
        });
    }

    close(error: string | null = null): Promise<void> {
        this.closing = true;
        this.queue = this.queue
            .catch(() => {})
            .then(async () => {
                await this.child.stop();
                this.state.state = error ? 'failed' : 'stopped';
                this.state.error = error ? this.redact(error) : null;
                await this.write();
            });
        return this.queue;
    }
}

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
    let builder: Awaited<ReturnType<typeof createBackendBuilder>> | null = null;
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
    const supervisor = new BundleSupervisor(
        state,
        child,
        (next) => writeJson(statusFile, next),
        (value) => runner.redact(value),
    );
    const guarded = (work: Promise<void>) =>
        work.catch((error: unknown) => {
            void close(
                1,
                error instanceof Error ? error.message : String(error),
            );
            throw error;
        });
    async function close(code: number, error: string | null = null) {
        if (closing) return;
        closing = true;
        sentinels.forEach((file) => unwatchFile(file));
        await Promise.all([supervisor.close(error), builder?.dispose()]);
        process.exit(code);
    }
    process.once('SIGINT', () => void close(0));
    process.once('SIGTERM', () => void close(0));
    await supervisor.buildStarted();
    const previousGoMemoryLimit = process.env.GOMEMLIMIT;
    process.env.GOMEMLIMIT = '512MiB';
    try {
        builder = await createBackendBuilder({
            root,
            outDir,
            onBuildStart: () => guarded(supervisor.buildStarted()),
            onBuild: async (event) => {
                await guarded(supervisor.buildFinished(event));
                if (!event.ok && state.error)
                    process.stderr.write(`${state.error}\n`);
            },
        });
    } finally {
        if (previousGoMemoryLimit === undefined) delete process.env.GOMEMLIMIT;
        else process.env.GOMEMLIMIT = previousGoMemoryLimit;
    }
    try {
        await builder.watch();
        for (const file of sentinels) {
            watchFile(file, { interval: 250 }, (current, previous) => {
                if (closing || current.mtimeMs === previous.mtimeMs) return;
                supervisor.invalidate();
                void builder!.rebuild().catch(() => {});
            });
        }
    } catch (error) {
        await close(1, error instanceof Error ? error.message : String(error));
    }
}

if (require.main === module)
    void main().catch((error: unknown) => {
        process.stderr.write(
            `ldenv bundle: ${runner.redact(error instanceof Error ? error.message : String(error))}\n`,
        );
        process.exitCode = 1;
    });
