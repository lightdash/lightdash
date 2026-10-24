import {
    getExternalModelNodesFromManifest,
    type DbtManifest,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { type DbtManifestFetchOptions, type ProjectAdapter } from '../types';
import { CROSS_SOURCE_SETTLE_GRACE_MS } from './crossSourceCancellation';
import { resolveCrossSourceManifests } from './crossSourceRefs';
import { DbtSourceDiskPool } from './DbtSourceDiskPool';

const result = (key: string) => ({
    manifest: {
        metadata: { project_name: key },
        nodes: {
            [`model.${key}.orders`]: {
                unique_id: `model.${key}.orders`,
                name: 'orders',
                path: 'models/orders.sql',
                original_file_path: 'models/orders.sql',
                schema: 'public',
                resource_type: 'model',
                access: 'public',
                package_name: key,
                config: { materialized: 'table' },
            },
        },
        metrics: {},
        docs: {},
    } as unknown as DbtManifest,
    timings: { gitRefreshMs: null, depsMs: null, manifestMs: 1 },
});

describe('DbtSourceDiskPool', () => {
    it('returns a compile timeout before creation settles and cleans up later', async () => {
        vi.useFakeTimers();
        const pool = new DbtSourceDiskPool(1);
        let finish!: (adapter: ProjectAdapter) => void;
        const remove = vi.fn(async () => undefined);
        const fetch = vi.fn(async () => result('leaf_a'));
        let failed = false;
        const compile = resolveCrossSourceManifests({
            enabled: true,
            concurrency: 1,
            timeouts: { prepareMs: 1, lsMs: 1000, resolutionMs: 100000 },
            tasks: [
                {
                    key: 'leaf_a',
                    context: null,
                    fetch,
                    prepare: ({ signal }: { signal?: AbortSignal } = {}) =>
                        pool.run(
                            'leaf_a',
                            () =>
                                new Promise<ProjectAdapter>((resolve) => {
                                    finish = resolve;
                                }),
                            async () => null,
                            signal,
                        ),
                },
            ],
        }).catch(async (error: unknown) => {
            await pool.release('leaf_a');
            failed = true;
            return error;
        });
        try {
            await vi.advanceTimersByTimeAsync(
                1 + 2 * CROSS_SOURCE_SETTLE_GRACE_MS,
            );
            expect(failed).toBe(true);
            expect(await compile).toMatchObject({
                message: expect.stringContaining('timed out'),
            });
            expect(remove).not.toHaveBeenCalled();
            finish({ releaseDisk: remove } as unknown as ProjectAdapter);
            await vi.advanceTimersByTimeAsync(0);
            expect(remove).toHaveBeenCalledOnce();
            expect(fetch).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it.each(['projectName', 'declaredUpstreams'] as const)(
        'rejects a recreated source when its %s changes',
        async (field) => {
            const pool = new DbtSourceDiskPool(1);
            const scan = {
                projectName: 'leaf_a',
                declaredUpstreams: [],
                installedPackages: [],
                referencedProjects: [],
                refs: [],
                localModels: [],
                installedPackageModels: [],
            };
            const rescan = vi.fn(async () => ({
                ...scan,
                [field]: field === 'projectName' ? 'leaf_changed' : ['leaf_b'],
            }));
            const fetch = vi.fn(async () => result('leaf_a'));
            await expect(
                resolveCrossSourceManifests({
                    enabled: true,
                    concurrency: 1,
                    tasks: [
                        {
                            key: 'leaf_a',
                            context: null,
                            withDisk: (operation, signal) =>
                                pool.run(
                                    'leaf_a',
                                    async () =>
                                        ({
                                            releaseDisk: vi.fn(),
                                        }) as unknown as ProjectAdapter,
                                    operation,
                                    signal,
                                ),
                            prepare: async () => {
                                await pool.run(
                                    'leaf_a',
                                    async () =>
                                        ({
                                            releaseDisk: vi.fn(),
                                        }) as unknown as ProjectAdapter,
                                    async () => {},
                                );
                                await pool.run(
                                    'leaf_b',
                                    async () =>
                                        ({
                                            releaseDisk: vi.fn(),
                                        }) as unknown as ProjectAdapter,
                                    async () => {},
                                );
                                return scan;
                            },
                            prepareFetch: rescan,
                            fetch,
                        },
                    ],
                }),
            ).rejects.toThrow(
                'dbt source "leaf_a" changed while this project was compiling. Refresh dbt again.',
            );
            expect(rescan).toHaveBeenCalledOnce();
            expect(pool.stats.diskRecreations).toBe(1);
            expect(fetch).not.toHaveBeenCalled();
            await pool.release('leaf_a');
        },
    );

    it('preserves disk release errors that settle within the grace period', async () => {
        const pool = new DbtSourceDiskPool(1);
        const failure = new Error('leaf_a disk release failed');
        await pool.run(
            'leaf_a',
            async () =>
                ({
                    releaseDisk: vi.fn(async () => {
                        throw failure;
                    }),
                }) as unknown as ProjectAdapter,
            async () => {},
        );
        await expect(pool.release('leaf_a')).rejects.toBe(failure);
    });

    it('bounds 16 scanned sources through eviction and recreation with one parse each', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'disk-pool-'));
        await fs.mkdir(path.join(root, 'primary'));
        const pool = new DbtSourceDiskPool(2);
        const adapters = new Map<string, ProjectAdapter>();
        const scans = new Map<string, number>();
        const attempts = new Map<string, number>();
        const active = new Set<string>();
        let peak = 1;
        const getAdapter = async (key: string) => {
            if (!adapters.has(key)) {
                const directory = path.join(root, key);
                const prepareDbtSource = async () => {
                    await fs.mkdir(directory, { recursive: true });
                    const count = (await fs.readdir(root)).length;
                    peak = Math.max(peak, count);
                    expect(count).toBeLessThanOrEqual(3);
                    return {
                        projectDir: directory,
                        timings: { gitRefreshMs: null, depsMs: null },
                    };
                };
                await prepareDbtSource();
                adapters.set(key, {
                    prepareDbtSource,
                    releaseDisk: async () => {
                        expect(active.has(key)).toBe(false);
                        await fs.rm(directory, {
                            force: true,
                            recursive: true,
                        });
                    },
                } as unknown as ProjectAdapter);
            }
            return adapters.get(key)!;
        };
        const tasks = Array.from({ length: 16 }, (_, index) => {
            const key = `leaf_${index}`;
            return {
                key,
                context: key,
                withDisk: <R>(operation: () => Promise<R>) =>
                    pool.run(key, () => getAdapter(key), operation),
                prepare: () =>
                    pool.run(
                        key,
                        () => getAdapter(key),
                        async () => {
                            scans.set(key, (scans.get(key) ?? 0) + 1);
                            return {
                                projectName: key,
                                installedPackages: [],
                                declaredUpstreams:
                                    index === 0 ? ['leaf_15'] : [],
                                referencedProjects:
                                    index === 0 ? ['leaf_1'] : [],
                                refs:
                                    index === 0
                                        ? [
                                              {
                                                  packageName: 'leaf_1',
                                                  name: 'orders',
                                                  version: null,
                                              },
                                          ]
                                        : [],
                                localModels: [],
                                installedPackageModels: [],
                            };
                        },
                    ),
                prepareFetch: async () => {
                    await (await getAdapter(key)).prepareDbtSource();
                },
                fetch: async ({ externalNodes }: DbtManifestFetchOptions) => {
                    active.add(key);
                    try {
                        expect(
                            await fs.stat(path.join(root, key)),
                        ).toBeDefined();
                        attempts.set(key, (attempts.get(key) ?? 0) + 1);
                        if (index === 0)
                            expect(
                                externalNodes.map((node) => node.package_name),
                            ).toEqual(['leaf_1', 'leaf_15']);
                        return result(key);
                    } finally {
                        active.delete(key);
                    }
                },
            };
        });
        try {
            const resolved = await resolveCrossSourceManifests({
                tasks,
                cache: tasks.map((task) => ({
                    key: task.key,
                    projectName: task.key,
                    referencedProjects: [],
                    nodes: getExternalModelNodesFromManifest(
                        result(task.key).manifest,
                    ),
                })),
                concurrency: 2,
                enabled: true,
                onSourceFinal: (task) => pool.release(task.key),
            });
            expect(resolved.results).toHaveLength(16);
            expect(peak).toBe(3);
            expect([...attempts.values()]).toEqual(Array(16).fill(1));
            expect(resolved.attempts).toBe(16);
            expect([...scans.values()]).toEqual(Array(16).fill(1));
            expect(pool.stats.diskEvictions).toBeGreaterThan(0);
            expect(pool.stats.diskRecreations).toBeGreaterThan(0);
            expect(await fs.readdir(root)).toEqual(['primary']);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('evicts the least recently used idle source only when full', async () => {
        const pool = new DbtSourceDiskPool(2);
        const releaseA = vi.fn(async () => undefined);
        const releaseB = vi.fn(async () => undefined);
        const adapter = (releaseDisk: () => Promise<void>) => async () =>
            ({ releaseDisk }) as unknown as ProjectAdapter;
        await pool.run('leaf_a', adapter(releaseA), async () => {});
        await pool.run('leaf_b', adapter(releaseB), async () => {});
        await pool.run('leaf_a', adapter(releaseA), async () => {});
        expect(pool.stats.diskEvictions).toBe(0);
        await pool.run('leaf_c', adapter(vi.fn()), async () => {});
        expect(releaseA).not.toHaveBeenCalled();
        expect(releaseB).toHaveBeenCalledOnce();
    });

    it('waits for a running source before evicting its directory', async () => {
        const pool = new DbtSourceDiskPool(1);
        let finish!: () => void;
        const released = vi.fn(async () => undefined);
        const first = pool.run(
            'leaf_a',
            async () =>
                ({ releaseDisk: released }) as unknown as ProjectAdapter,
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        await vi.waitFor(() => expect(finish).toBeDefined());
        const nextStarted = vi.fn();
        const next = pool.run(
            'leaf_b',
            async () => ({ releaseDisk: vi.fn() }) as unknown as ProjectAdapter,
            async () => {
                nextStarted();
            },
        );
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(released).not.toHaveBeenCalled();
        expect(nextStarted).not.toHaveBeenCalled();
        finish();
        await Promise.all([first, next]);
        expect(released).toHaveBeenCalledOnce();
        expect(nextStarted).toHaveBeenCalledOnce();
    });
    it('does not create an aborted source waiting for disk space', async () => {
        const pool = new DbtSourceDiskPool(1);
        let finish!: () => void;
        const first = pool.run(
            'leaf_a',
            async () => ({ releaseDisk: vi.fn() }) as unknown as ProjectAdapter,
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        await vi.waitFor(() => expect(finish).toBeDefined());
        const controller = new AbortController();
        const create = vi.fn(
            async () => ({ releaseDisk: vi.fn() }) as unknown as ProjectAdapter,
        );
        const next = pool.run(
            'leaf_b',
            create,
            async () => {},
            controller.signal,
        );
        const reason = new Error('synthetic interruption');
        controller.abort(reason);
        await expect(next).rejects.toBe(reason);
        expect(create).not.toHaveBeenCalled();
        finish();
        await first;
    });

    it('waits for adapter creation before releasing a failed preparation', async () => {
        const pool = new DbtSourceDiskPool(1);
        let finish!: (adapter: ProjectAdapter) => void;
        const remove = vi.fn(async () => undefined);
        const first = pool.run(
            'leaf_a',
            () =>
                new Promise<ProjectAdapter>((resolve) => {
                    finish = resolve;
                }),
            async () => {},
        );
        await vi.waitFor(() => expect(finish).toBeDefined());
        const released = vi.fn();
        const cleanup = pool.release('leaf_a').then(released);
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(released).not.toHaveBeenCalled();
        finish({ releaseDisk: remove } as unknown as ProjectAdapter);
        await Promise.all([first, cleanup]);
        expect(remove).toHaveBeenCalledOnce();
    });
});

it('keeps an eviction failure fatal even when source failures are isolated', async () => {
    const pool = new DbtSourceDiskPool(1);
    const resident = {
        releaseDisk: vi.fn(async () => {
            throw new Error('eviction failed');
        }),
    } as unknown as ProjectAdapter;
    await pool.run(
        'resident',
        async () => resident,
        async () => undefined,
    );
    const onSourceFailure = vi.fn(async () => true);
    await expect(
        resolveCrossSourceManifests({
            tasks: [
                {
                    key: 'next',
                    context: null,
                    prepare: (options) =>
                        pool.run(
                            'next',
                            async () => resident,
                            async () => null,
                            options?.signal,
                        ),
                    fetch: async () => result('next'),
                },
            ],
            enabled: true,
            concurrency: 1,
            onSourceFailure,
        }),
    ).rejects.toThrow('disk pool');
    expect(onSourceFailure).not.toHaveBeenCalled();
});
