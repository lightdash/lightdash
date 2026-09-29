import { watch, watchFile, unwatchFile, type FSWatcher } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createBackendBuilder, type BuildEvent } from './backend-bundle.cjs';
import { BundleChild } from './bundle-child';
import { bundleDirectory, type BundleState } from './bundle-state';
import { sourceHash } from './cache';
import { home, readJson, runner, statePath, writeJson } from './io';
import { instanceId, type Instance, type Parent } from './model';
import {
    backendBundleInputs,
    publishSharedBundle,
    readSharedBundle,
    sharedBundleDirectory,
    type SharedBundle,
} from './shared-bundle';

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

    startShared(key: string, bundle: SharedBundle, buildMs = 0): Promise<void> {
        return this.enqueue(async () => {
            this.state.sharedKey = key;
            await this.write();
            await this.child.start();
            if (this.closing) return;
            this.state.apiStartedAt = new Date().toISOString();
            this.state.generation = 1;
            this.state.launchedRevision = 0;
            this.state.buildMs = buildMs;
            this.state.builtAt = bundle.builtAt;
            this.state.state = 'ready';
            this.state.error = null;
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
    const instance = await readJson<Instance>(statePath(id));
    const parent = await readJson<Parent>(
        path.join(home, 'manifests', `${instance.parent}.json`),
    );
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
        sharedKey: null,
    };
    let closing = false;
    let builder: Awaited<ReturnType<typeof createBackendBuilder>> | null = null;
    let sharedWatcher: FSWatcher | null = null;
    let sourceChanged = false;
    let sourceEventSeen = false;
    let sourceKey: string | null = null;
    let sharedActive = false;
    let startingPrivate: Promise<void> | null = null;
    const packageNames = ['common', 'formula', 'warehouses'];
    const packageHashes = new Map(
        packageNames.map((name) => [
            name,
            parent.sourceHashes[`packages/${name}`],
        ]),
    );
    const sentinels = [
        'packages/common/dist/cjs/.tsbuildinfo',
        'packages/formula/dist/.tsbuildinfo',
        'packages/warehouses/dist/.tsbuildinfo',
    ].map((file) => path.join(root, file));
    const nodeArgs = [
        '--enable-source-maps',
        ...(process.env.DEBUG_PORT
            ? [`--inspect=127.0.0.1:${process.env.DEBUG_PORT}`]
            : []),
    ];
    const privateArgs = [...nodeArgs, path.join(outDir, 'api.cjs')];
    const child = new BundleChild({
        executable: process.execPath,
        args: privateArgs,
        cwd: path.join(root, 'packages/backend'),
        env: {
            ...process.env,
            NODE_PATH: [
                path.join(root, 'packages/backend/node_modules'),
                path.join(root, 'node_modules'),
                process.env.NODE_PATH,
            ]
                .filter(Boolean)
                .join(path.delimiter),
        },
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
        sharedWatcher?.close();
        sentinels.forEach((file) => unwatchFile(file));
        await Promise.all([supervisor.close(error), builder?.dispose()]);
        process.exit(code);
    }
    process.once('SIGINT', () => void close(0));
    process.once('SIGTERM', () => void close(0));
    const startPrivate = (): Promise<void> => {
        if (startingPrivate) return startingPrivate;
        startingPrivate = (async () => {
            supervisor.invalidate();
            await supervisor.buildStarted();
            const previousGoMemoryLimit = process.env.GOMEMLIMIT;
            process.env.GOMEMLIMIT = '512MiB';
            try {
                builder = await createBackendBuilder({
                    root,
                    outDir,
                    onBuildStart: () => guarded(supervisor.buildStarted()),
                    onBuild: async (event) => {
                        if (event.ok) {
                            child.setArgs(privateArgs);
                            state.sharedKey = null;
                        }
                        await guarded(supervisor.buildFinished(event));
                        if (!event.ok && state.error)
                            process.stderr.write(`${state.error}\n`);
                    },
                });
            } finally {
                if (previousGoMemoryLimit === undefined)
                    delete process.env.GOMEMLIMIT;
                else process.env.GOMEMLIMIT = previousGoMemoryLimit;
            }
            await builder.watch();
            sharedWatcher?.close();
            sharedWatcher = null;
        })();
        return startingPrivate;
    };
    const sourceEvent = () => {
        if (closing) return;
        if (!sourceKey) {
            sourceEventSeen = true;
            return;
        }
        void backendBundleInputs(root)
            .then((current) => {
                if (current.key === sourceKey || closing) return;
                sourceChanged = true;
                if (sharedActive) void guarded(startPrivate());
            })
            .catch((error: unknown) =>
                close(
                    1,
                    error instanceof Error ? error.message : String(error),
                ),
            );
    };
    try {
        sharedWatcher = watch(
            path.join(root, 'packages/backend/src'),
            { recursive: true },
            sourceEvent,
        );
        for (const [index, file] of sentinels.entries()) {
            watchFile(file, { interval: 250 }, (current, previous) => {
                if (closing || current.mtimeMs === previous.mtimeMs) return;
                const name = packageNames[index];
                void sourceHash(root, `packages/${name}`)
                    .then((hash) => {
                        if (closing || hash === packageHashes.get(name)) return;
                        packageHashes.set(name, hash);
                        supervisor.invalidate();
                        if (builder) void builder.rebuild().catch(() => {});
                        else if (sharedActive) void guarded(startPrivate());
                        else sourceChanged = true;
                    })
                    .catch((error: unknown) =>
                        close(
                            1,
                            error instanceof Error
                                ? error.message
                                : String(error),
                        ),
                    );
            });
        }
        await supervisor.buildStarted();
        const inputs = await backendBundleInputs(root);
        sourceKey = inputs.key;
        const cached = await readSharedBundle(inputs.key);
        let shared: SharedBundle | null = cached;
        if (!shared)
            try {
                shared = await publishSharedBundle(root, inputs);
            } catch (error) {
                if (!sourceChanged) throw error;
            }
        if (sourceEventSeen)
            sourceChanged =
                sourceChanged ||
                (await backendBundleInputs(root)).key !== inputs.key;
        if (sourceChanged) {
            await startPrivate();
        } else {
            if (!shared) throw new Error('Shared bundle publication failed');
            child.setArgs([
                ...nodeArgs,
                path.join(sharedBundleDirectory(inputs.key), 'api.cjs'),
            ]);
            await supervisor.startShared(
                inputs.key,
                shared,
                cached ? 0 : shared.buildMs,
            );
            sharedActive = true;
            process.stdout.write(
                `ldenv bundle shared key=${inputs.key} hit=${Boolean(cached)} buildMs=${cached ? 0 : shared.buildMs}\n`,
            );
            if (sourceChanged) await startPrivate();
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
