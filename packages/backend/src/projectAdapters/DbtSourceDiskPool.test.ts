import { DbtError, type DbtManifest } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { type DbtManifestFetchOptions, type ProjectAdapter } from '../types';
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
