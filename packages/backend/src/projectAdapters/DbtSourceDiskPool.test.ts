import { DbtError, type DbtManifest } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES,
    resolveDbtSourceFetchConcurrency,
} from '../config/dbtSourceFetchConcurrency';
import { type DbtManifestFetchOptions, type ProjectAdapter } from '../types';
import { CROSS_SOURCE_SETTLE_GRACE_MS } from './crossSourceCancellation';
import { resolveCrossSourceManifests } from './crossSourceRefs';
import {
    DbtSourceDiskPool,
    measureDbtSourceDiskBytes,
} from './DbtSourceDiskPool';

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
                package_name: key,
                config: { materialized: 'table' },
            },
        },
        metrics: {},
        docs: {},
    } as unknown as DbtManifest,
    timings: { gitRefreshMs: null, depsMs: null, manifestMs: 1 },
});

describe('measureDbtSourceDiskBytes', () => {
    it('stops walking when the compile is cancelled', async () => {
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'synthetic-cancel-disk-'),
        );
        const controller = new AbortController();
        const lstat = fs.lstat.bind(fs);
        const stat = vi
            .spyOn(fs, 'lstat')
            .mockImplementationOnce(async (...args) => {
                const stats = await lstat(...args);
                controller.abort();
                return stats;
            });
        try {
            await fs.writeFile(path.join(root, 'model.sql'), 'select 1');
            expect(
                await measureDbtSourceDiskBytes(root, controller.signal),
            ).toBeNull();
            expect(stat).toHaveBeenCalledOnce();
        } finally {
            stat.mockRestore();
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('counts allocated bytes without walking a symlink target', async () => {
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'synthetic-disk-bytes-'),
        );
        try {
            const directory = path.join(root, 'checkout_a');
            const outside = path.join(root, 'target_a');
            const file = path.join(directory, 'model.sql');
            const link = path.join(directory, 'linked_target');
            await fs.mkdir(directory);
            await fs.mkdir(outside);
            await fs.writeFile(file, 'select 1');
            await fs.writeFile(
                path.join(outside, 'manifest.json'),
                'synthetic target',
            );
            await fs.symlink(outside, link);
            const expected =
                ((await fs.lstat(directory)).blocks +
                    (await fs.lstat(file)).blocks +
                    (await fs.lstat(link)).blocks) *
                512;
            expect(await measureDbtSourceDiskBytes(directory)).toBe(expected);
            expect(await measureDbtSourceDiskBytes(link)).toBe(
                (await fs.lstat(link)).blocks * 512,
            );
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it('reports unknown bytes for absent or unreadable directories', async () => {
        expect(await measureDbtSourceDiskBytes(undefined)).toBeNull();
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'synthetic-missing-disk-'),
        );
        try {
            expect(
                await measureDbtSourceDiskBytes(path.join(root, 'absent_a')),
            ).toBeNull();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});

describe('DbtSourceDiskPool', () => {
    it.each([1, 2, 4])(
        'fetches resident scans before recreating evicted sources at concurrency %s',
        async (concurrency) => {
            const sourceCount = 6;
            const capacity = 4;
            const pool = new DbtSourceDiskPool(capacity);
            const fetchOrder: string[] = [];
            let initialScanEvictions = 0;
            const sources = Array.from({ length: sourceCount }, (_, index) => {
                const key = `leaf_${index}`;
                let checkoutExists = false;
                const clone = vi.fn(() => {
                    checkoutExists = true;
                });
                const scan = {
                    projectName: key,
                    declaredUpstreams: [],
                    installedPackages: [],
                    referencedProjects: [],
                    refs: [],
                    localModels: [],
                    installedPackageModels: [],
                };
                const prepare = async () => {
                    if (!checkoutExists) clone();
                    return scan;
                };
                const adapter = {
                    releaseDisk: async () => {
                        checkoutExists = false;
                    },
                } as unknown as ProjectAdapter;
                return {
                    clone,
                    task: {
                        key,
                        context: null,
                        isDiskResident: () => pool.isResident(key),
                        withDisk: <R>(operation: () => Promise<R>) =>
                            pool.run(key, async () => adapter, operation),
                        prepare: () =>
                            pool.run(key, async () => adapter, prepare),
                        prepareFetch: async () => {
                            initialScanEvictions ||= pool.stats.diskEvictions;
                            return prepare();
                        },
                        fetch: async () => {
                            expect(checkoutExists).toBe(true);
                            fetchOrder.push(key);
                            return result(key);
                        },
                    },
                };
            });
            const resolved = await resolveCrossSourceManifests({
                enabled: true,
                concurrency,
                tasks: sources.map(({ task }) => task),
                onSourceFinal: (task) => pool.release(task.key),
            });
            expect(resolved.results).toHaveLength(sourceCount);
            expect(initialScanEvictions).toBe(sourceCount - capacity);
            expect(new Set(fetchOrder.slice(0, capacity))).toEqual(
                new Set(['leaf_2', 'leaf_3', 'leaf_4', 'leaf_5']),
            );
            sources
                .slice(-capacity)
                .forEach(({ clone }) => expect(clone).toHaveBeenCalledOnce());
            expect(
                sources.reduce(
                    (sum, { clone }) => sum + clone.mock.calls.length,
                    0,
                ),
            ).toBeLessThanOrEqual(sourceCount + initialScanEvictions);
            expect(pool.stats.diskRecreations).toBe(initialScanEvictions);
            expect(pool.isResident('leaf_5')).toBe(false);
            expect(pool.isResident('absent')).toBe(false);
        },
    );

    it('reuses all scanned checkouts when the disk budget exceeds concurrency', async () => {
        const decision = resolveDbtSourceFetchConcurrency(
            1,
            {
                availableParallelism: () => 1,
                constrainedMemory: () => undefined,
                baselineSize: () => 0,
            },
            {
                sourceFetchDiskBudgetBytes:
                    DBT_SOURCE_FETCH_DISK_RESERVE_BYTES + 4 * 1024,
                sourceFetchDiskPerSourceBytes: 1024,
            },
        );
        const pool = new DbtSourceDiskPool(decision.diskCapacity);
        const releases = Array.from({ length: 4 }, () =>
            vi.fn(async () => undefined),
        );
        const adapters = releases.map(
            (releaseDisk) => ({ releaseDisk }) as unknown as ProjectAdapter,
        );
        await adapters.reduce(async (previous, adapter, index) => {
            await previous;
            await pool.run(
                `leaf_${index}`,
                async () => adapter,
                async () => {},
            );
        }, Promise.resolve());
        await adapters.reduce(async (previous, expected, index) => {
            await previous;
            await pool.run(
                `leaf_${index}`,
                async () => expected,
                async (adapter) => {
                    expect(adapter).toBe(expected);
                    expect(releases[index]).not.toHaveBeenCalled();
                },
            );
            await pool.release(`leaf_${index}`);
        }, Promise.resolve());
        expect(pool.stats).toEqual({ diskEvictions: 0, diskRecreations: 0 });
        releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    });

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
                    prepare: ({ signal } = {}) =>
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

    it('bounds 16 scanned sources through eviction, recreation and a retry', async () => {
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
                                declaredUpstreams: [],
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
                        if (
                            index === 0 &&
                            !externalNodes.some(
                                (node) => node.package_name === 'leaf_15',
                            )
                        ) {
                            throw new DbtError(
                                "depends on a node named 'orders' in package or project 'leaf_15' which was not found",
                            );
                        }
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
                concurrency: 2,
                enabled: true,
                onSourceFinal: (task) => pool.release(task.key),
            });
            expect(resolved.results).toHaveLength(16);
            expect(peak).toBe(3);
            expect(attempts.get('leaf_0')).toBe(2);
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
