import {
    DbtError,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
import { placeholderExternalNode } from '../dbt/dbtExternalNodes';
import { type DbtProjectScan } from '../dbt/dbtProjectScan';
import { type DbtManifestFetchOptions } from '../types';
import {
    resolveCrossSourceManifests,
    type CrossSourceFetchTask,
} from './crossSourceRefs';

const model = (
    project: string,
    name = 'orders',
): DbtRawModelNode & DbtManifest['nodes'][string] => ({
    unique_id: `model.${project}.${name}`,
    resource_type: 'model',
    raw_code: 'select 1',
    config: { materialized: 'table', snowflake_warehouse: '' },
    name,
    package_name: project,
    path: `${name}.sql`,
    original_file_path: `models/${name}.sql`,
    alias: name,
    schema: 'public',
    access: 'public',
    database: 'warehouse',
    columns: {},
    meta: {},
    fqn: [project, name],
    checksum: { name: 'sha256', checksum: 'test' },
});
const manifest = (project: string): DbtManifest => {
    const node = model(project);
    return {
        metadata: {
            dbt_schema_version: '/v12.json',
            generated_at: '',
            adapter_type: 'postgres',
            project_name: project,
        },
        nodes: { [node.unique_id]: node },
        metrics: {},
        docs: {},
    };
};
const result = (project: string) => ({
    manifest: manifest(project),
    timings: { gitRefreshMs: null, depsMs: null, manifestMs: 1 },
});
const missing = (project: string, name = 'orders') =>
    new DbtError(
        `Model 'model.analytics.orders' depends on a node named '${name}' in package or project '${project}' which was not found`,
    );
const task = (
    key: string,
    fetch = vi.fn(async (_options: DbtManifestFetchOptions) => result(key)),
): CrossSourceFetchTask<string> & { fetch: typeof fetch } => ({
    key,
    context: key,
    fetch,
});
const resolve = (
    tasks: CrossSourceFetchTask<string>[],
    enabled = true,
    concurrency = 2,
) => resolveCrossSourceManifests({ tasks, enabled, concurrency });

const scannedTask = (
    key: string,
    references: string[] = [],
    declared: string[] = [],
) => ({
    ...task(key),
    prepare: vi.fn(
        async (): Promise<DbtProjectScan> => ({
            projectName: key,
            refs: references.map((packageName) => ({
                packageName,
                name: 'orders',
                version: null,
            })),
            localModels: ['orders'],
            installedPackageModels: [],
            referencedProjects: references,
            declaredUpstreams: declared,
            installedPackages: [],
        }),
    ),
});
describe('cross-source hygiene', () => {
    it('keeps learning other unresolved refs through the pass cap', async () => {
        const leaf = scannedTask('leaf_a');
        const first = scannedTask('ring_0');
        first.fetch.mockRejectedValue(missing('leaf_a', 'absent'));
        const second = scannedTask('ring_1');
        second.fetch
            .mockRejectedValueOnce(missing('leaf_a', 'before'))
            .mockRejectedValueOnce(missing('leaf_a', 'after'));
        await expect(resolve([first, second, leaf])).rejects.toThrow('absent');
        expect(first.fetch).toHaveBeenCalledTimes(3);
        expect(second.fetch).toHaveBeenCalledTimes(3);
    });

    it('groups all missing declarations before any fetch', async () => {
        const first = scannedTask('leaf_a', [], ['ring_0', 'ring_1']);
        const second = scannedTask('leaf_b', [], ['ring_2']);
        const failure = resolve([first, second]);
        await expect(failure).rejects.toThrow('ring_0');
        await expect(failure).rejects.toThrow('ring_1');
        await expect(failure).rejects.toThrow('leaf_b');
        expect(first.fetch).not.toHaveBeenCalled();
        expect(second.fetch).not.toHaveBeenCalled();
    });

    it('warns for unknown scanned projects but accepts installed packages', async () => {
        const leaf = scannedTask('leaf_a', ['ring_0', 'ring_1']);
        leaf.prepare.mockResolvedValue({
            projectName: 'leaf_a',
            referencedProjects: ['ring_0', 'ring_1'],
            declaredUpstreams: [],
            refs: [],
            localModels: [],
            installedPackageModels: [],
            installedPackages: ['ring_1'],
        });
        const resolution = await resolve([leaf]);
        expect(resolution.warnings).toEqual([
            expect.stringContaining('ring_0'),
        ]);
        expect(resolution.preflightWarnings).toBe(1);
    });

    it('names both sources and connections for a declared upstream elsewhere', async () => {
        const leaf = scannedTask('leaf_a', [], ['ring_0']);
        const failure = resolveCrossSourceManifests({
            tasks: [leaf],
            enabled: true,
            concurrency: 2,
            connectionName: 'Warehouse A',
            otherConnectionProjects: [
                {
                    projectName: 'ring_0',
                    sourceKey: 'leaf_b',
                    connectionName: 'Warehouse B',
                },
            ],
        });
        await Promise.all(
            [
                'leaf_a',
                'leaf_b',
                'Warehouse A',
                'Warehouse B',
                'same warehouse connection',
            ].map((text) => expect(failure).rejects.toThrow(text)),
        );
        expect(leaf.fetch).not.toHaveBeenCalled();
    });

    it('warns for a scanned project elsewhere and uses that explanation in the final error', async () => {
        const leaf = scannedTask('leaf_a', ['ring_0']);
        const options = {
            tasks: [leaf],
            enabled: true,
            concurrency: 2,
            connectionName: 'Warehouse A',
            otherConnectionProjects: [
                {
                    projectName: 'ring_0',
                    sourceKey: 'leaf_b',
                    connectionName: 'Warehouse B',
                },
            ],
        };
        expect((await resolveCrossSourceManifests(options)).warnings).toEqual([
            expect.stringContaining('leaf_b'),
        ]);
        leaf.fetch.mockRejectedValue(missing('ring_0'));
        await expect(resolveCrossSourceManifests(options)).rejects.toThrow(
            'different warehouse connection',
        );
    });

    it.each(['prepare', 'ls', 'resolution'] as const)(
        'cancels and settles sibling work on a %s deadline',
        async (phase) => {
            vi.useFakeTimers();
            try {
                const settled: string[] = [];
                const operation = (key: string, signal: AbortSignal) =>
                    new Promise<ReturnType<typeof result>>((done) => {
                        signal.addEventListener(
                            'abort',
                            () => {
                                setTimeout(() => {
                                    settled.push(key);
                                    done(result(key));
                                }, 10);
                            },
                            { once: true },
                        );
                    });
                const tasks: CrossSourceFetchTask<string>[] = [
                    'leaf_a',
                    'leaf_b',
                ].map((key) => ({
                    key,
                    context: key,
                    prepare:
                        phase === 'prepare'
                            ? async (options) => {
                                  await operation(key, options!.signal!);
                                  return null;
                              }
                            : undefined,
                    fetch: async (options) => operation(key, options.signal!),
                }));
                const resolution = resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    timeouts: {
                        prepareMs: phase === 'prepare' ? 20 : 1000,
                        lsMs: phase === 'ls' ? 20 : 1000,
                        resolutionMs: phase === 'resolution' ? 20 : 1000,
                    },
                });
                const rejected = resolution.catch((error: unknown) => error);
                const expectedMessage = {
                    prepare:
                        'dbt source "leaf_a" timed out after 0.02 s while cloning the repository and installing dbt packages.',
                    ls: 'dbt source "leaf_a" timed out after 0.02 s while running dbt ls.',
                    resolution:
                        'Cross-source dbt resolution timed out after 0.02 s. Sources still in progress: "leaf_a", "leaf_b".',
                }[phase];
                await vi.advanceTimersByTimeAsync(21);
                expect(settled).toEqual([]);
                await vi.runAllTimersAsync();
                expect(await rejected).toHaveProperty(
                    'message',
                    expectedMessage,
                );
                expect(settled.sort()).toEqual(['leaf_a', 'leaf_b']);
            } finally {
                vi.useRealTimers();
            }
        },
    );

    it('throws the caller reason unchanged after sibling cancellation settles', async () => {
        const controller = new AbortController();
        const reason = new Error('leaf_a interrupted');
        const settled = vi.fn();
        const leaf = task(
            'leaf_a',
            vi.fn(
                async (options: DbtManifestFetchOptions) =>
                    new Promise<ReturnType<typeof result>>((done) => {
                        options.signal!.addEventListener(
                            'abort',
                            () => {
                                settled();
                                done(result('leaf_a'));
                            },
                            { once: true },
                        );
                    }),
            ),
        );
        Object.assign(leaf, {
            prepare: async () => ({
                projectName: 'leaf_a',
                referencedProjects: [],
                declaredUpstreams: [],
                refs: [],
                localModels: [],
                installedPackageModels: [],
                installedPackages: [],
            }),
        });
        const dependent = scannedTask('leaf_b', ['leaf_a']);
        const resolution = resolveCrossSourceManifests({
            tasks: [leaf, dependent],
            enabled: true,
            concurrency: 2,
            signal: controller.signal,
        });
        const rejected = resolution.catch((error: unknown) => error);
        await vi.waitFor(() => expect(leaf.fetch).toHaveBeenCalledTimes(1));
        controller.abort(reason);
        expect(await rejected).toBe(reason);
        expect(settled).toHaveBeenCalledOnce();
        expect(dependent.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not pass an already-aborted caller signal to disabled work', async () => {
        const controller = new AbortController();
        controller.abort(new Error('leaf_a interrupted'));
        const leaf = task('leaf_a');
        const resolution = await resolveCrossSourceManifests({
            tasks: [leaf],
            enabled: false,
            concurrency: 1,
            signal: controller.signal,
            timeouts: { prepareMs: 0, lsMs: 0, resolutionMs: 0 },
        });
        expect(leaf.fetch).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
        });
        expect(resolution.results).toHaveLength(1);
    });
});

it('retries a newly revealed missing version of the same ref', async () => {
    const missingVersion = (version: string) =>
        new DbtError(
            `depends on a node named 'orders' with version '${version}' in package or project 'leaf_a' which was not found`,
        );
    const consumer = task(
        'ring_0',
        vi
            .fn()
            .mockRejectedValueOnce(missingVersion('1'))
            .mockRejectedValueOnce(missingVersion('2'))
            .mockResolvedValue(result('ring_0')),
    );
    const resolution = await resolve([consumer, task('leaf_a')]);
    expect(consumer.fetch).toHaveBeenCalledTimes(3);
    expect(resolution.results).toHaveLength(2);
});

it('settles an in-flight sibling before propagating a thrown fetch failure', async () => {
    let settled = false;
    const reason = new Error('leaf_b failed');
    const first = task(
        'leaf_a',
        vi.fn(
            async (options: DbtManifestFetchOptions) =>
                new Promise<ReturnType<typeof result>>((done) => {
                    options.signal!.addEventListener(
                        'abort',
                        () => {
                            settled = true;
                            done(result('leaf_a'));
                        },
                        { once: true },
                    );
                }),
        ),
    );
    const second = task('leaf_b', vi.fn().mockRejectedValue(reason));
    await expect(resolve([first, second])).rejects.toBe(reason);
    expect(settled).toBe(true);
});

it('starts source deadlines only after a concurrency slot is available', async () => {
    vi.useFakeTimers();
    try {
        const tasks: CrossSourceFetchTask<string>[] = ['leaf_a', 'leaf_b'].map(
            (key) => ({
                key,
                context: key,
                prepare: async () => {
                    await new Promise<void>((done) => {
                        setTimeout(done, 5);
                    });
                    return null;
                },
                fetch: async () => {
                    await new Promise<void>((done) => {
                        setTimeout(done, 5);
                    });
                    return result(key);
                },
            }),
        );
        const resolution = resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency: 1,
            timeouts: { prepareMs: 6, lsMs: 6, resolutionMs: 100 },
        });
        await vi.runAllTimersAsync();
        expect((await resolution).results).toHaveLength(2);
    } finally {
        vi.useRealTimers();
    }
});

const withRefs = (
    key: string,
    refs: DbtProjectScan['refs'],
    names = ['orders'],
) => {
    const source = scannedTask(key);
    source.prepare.mockResolvedValue({
        projectName: key,
        refs,
        localModels: names,
        installedPackageModels: [],
        referencedProjects: refs.flatMap((ref) =>
            ref.packageName === null ? [] : [ref.packageName],
        ),
        declaredUpstreams: [],
        installedPackages: [],
    });
    return source;
};
const ref = (
    packageName: string | null,
    name = 'orders',
    version: string | null = null,
) => ({ packageName, name, version });
const boundResult = (
    key: string,
    nodes: DbtManifestFetchOptions['externalNodes'],
    refs: DbtProjectScan['refs'],
    expectedIds: string[] | null = null,
) => {
    const fetched = result(key);
    const own = fetched.manifest.nodes[
        `model.${key}.orders`
    ] as DbtRawModelNode;
    own.refs = refs.map((entry) => ({
        package: entry.packageName,
        name: entry.name,
        version: entry.version,
    }));
    own.depends_on = { nodes: [] };
    refs.forEach((entry, index) => {
        const candidates = nodes.filter(
            (node) =>
                node.name === entry.name &&
                (entry.packageName === null ||
                    node.package_name === entry.packageName),
        );
        const stub = candidates.find((node) => {
            if (expectedIds !== null)
                return (
                    `model.${node.package_name}.${node.name}${node.version === null ? '' : `.v${node.version}`}` ===
                    expectedIds[index]
                );
            if (entry.version !== null)
                return String(node.version) === entry.version;
            return (
                node.version === null ||
                String(node.version) === String(node.latest_version)
            );
        });
        if (!stub) throw missing(entry.packageName ?? '', entry.name);
        const id = `model.${stub.package_name}.${stub.name}${stub.version === null ? '' : `.v${stub.version}`}`;
        fetched.manifest.nodes[id] = {
            ...model(stub.package_name, stub.name),
            unique_id: id,
            version: stub.version ?? undefined,
            latest_version: stub.latest_version ?? undefined,
            access: stub.access ?? undefined,
            path: '',
            original_file_path: '',
        } as DbtRawModelNode & DbtManifest['nodes'][string];
        own.depends_on!.nodes!.push(id);
    });
    return fetched;
};

it('preserves disabled work byte for byte and never prepares or writes cache rows', async () => {
    const source = scannedTask('a');
    const onSourceResolved = vi.fn();
    const resolved = await resolveCrossSourceManifests({
        tasks: [source],
        enabled: false,
        concurrency: 1,
        onSourceResolved,
    });
    expect(source.fetch).toHaveBeenCalledExactlyOnceWith({ externalNodes: [] });
    expect(source.prepare).not.toHaveBeenCalled();
    expect(onSourceResolved).not.toHaveBeenCalled();
    expect(resolved).toEqual({
        results: [{ task: source, result: result('a'), injectedFrom: [] }],
        rounds: 1,
        attempts: 1,
        warnings: [],
        scan: { known: 0, ordered: 0 },
        firstAttemptInjected: 0,
    });
});

it.each([2, 9])(
    'resolves a %i-source project ring through the primary in one pass',
    async (count) => {
        const tasks = Array.from({ length: count }, (_, index) => {
            const key = `ring_${index}`;
            const refs = [ref(`ring_${(index + 1) % count}`, 'base')];
            const source = withRefs(key, refs, ['base', 'orders']);
            source.fetch.mockImplementation(async ({ externalNodes }) => {
                const fetched = boundResult(key, externalNodes, refs);
                const base = model(key, 'base');
                fetched.manifest.nodes[base.unique_id] = base;
                return fetched;
            });
            return source;
        });
        const onSourceResolved = vi.fn();
        const resolved = await resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency: 3,
            onSourceResolved,
        });
        expect(resolved.passes).toBe(1);
        expect(resolved.attempts).toBe(count);
        expect(resolved.contradictions).toBe(0);
        expect(resolved.stubs?.placeholder).toBe(count);
        expect(onSourceResolved).toHaveBeenCalledTimes(count);
        expect(
            resolved.results[0].result.manifest.nodes['model.ring_1.base'],
        ).toBeUndefined();
        expect(resolved.sources?.map((source) => source.lsRuns)).toEqual(
            Array(count).fill(1),
        );
    },
);

it('allows declared project cycles', async () => {
    const a = scannedTask('a', [], ['b']);
    const b = scannedTask('b', [], ['a']);
    expect((await resolve([a, b])).passes).toBe(1);
});

it('uses cached stubs with zero contradictions', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref('a')]),
    );
    const cached = {
        ...placeholderExternalNode({
            packageName: 'a',
            name: 'orders',
            version: null,
            latestVersion: null,
        }),
        schema: 'real_schema',
    };
    const resolved = await resolveCrossSourceManifests({
        tasks: [consumer, scannedTask('a')],
        enabled: true,
        concurrency: 2,
        cache: [
            {
                key: 'a',
                projectName: 'a',
                referencedProjects: [],
                nodes: [cached],
            },
        ],
    });
    expect(resolved.passes).toBe(1);
    expect(resolved.stubs?.cached).toBe(1);
    expect(resolved.contradictions).toBe(0);
    expect(consumer.fetch.mock.calls[0][0].externalNodes[0].schema).toBe(
        'real_schema',
    );
});

it('ignores cache rows whose project name no longer matches the scan', async () => {
    const consumer = withRefs('b', [ref('a')]);
    const resolved = await resolveCrossSourceManifests({
        tasks: [consumer, scannedTask('a')],
        enabled: true,
        concurrency: 2,
        cache: [
            {
                key: 'a',
                projectName: 'old_name',
                referencedProjects: [],
                nodes: [
                    placeholderExternalNode({
                        packageName: 'old_name',
                        name: 'orders',
                        version: null,
                        latestVersion: null,
                    }),
                ],
            },
        ],
    });
    expect(resolved.stubs?.cached).toBe(0);
    expect(consumer.fetch.mock.calls[0][0].externalNodes[0].package_name).toBe(
        'a',
    );
});

it('reruns only the consumer when cached latest_version changes', async () => {
    const provider = scannedTask('a');
    const provided = result('a');
    provided.manifest.nodes = Object.fromEntries(
        [1, 2].map((version) => {
            const node = {
                ...model('a'),
                unique_id: `model.a.orders.v${version}`,
                version,
                latest_version: 2,
            };
            return [node.unique_id, node];
        }),
    );
    provider.fetch.mockResolvedValue(provided);
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch
        .mockImplementationOnce(async ({ externalNodes }) =>
            boundResult('b', externalNodes, [ref('a')], ['model.a.orders.v1']),
        )
        .mockImplementationOnce(async ({ externalNodes }) =>
            boundResult('b', externalNodes, [ref('a')], ['model.a.orders.v2']),
        );
    const cache = [
        {
            key: 'a',
            projectName: 'a',
            referencedProjects: [],
            nodes: [1, 2].map((version) =>
                placeholderExternalNode({
                    packageName: 'a',
                    name: 'orders',
                    version: String(version),
                    latestVersion: '1',
                }),
            ),
        },
    ];
    const resolved = await resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        cache,
    });
    expect(resolved.passes).toBe(2);
    expect(resolved.contradictions).toBe(1);
    expect(consumer.fetch).toHaveBeenCalledTimes(2);
    expect(provider.fetch).toHaveBeenCalledTimes(1);
    expect(
        (
            resolved.results[0].result.manifest.nodes[
                'model.b.orders'
            ] as DbtRawModelNode
        ).depends_on?.nodes,
    ).toEqual(['model.a.orders.v2']);
});

it.each([false, true])(
    'keeps an explicit-version cycle when cached latest changes (implicit sibling: %s)',
    async (implicitSibling) => {
        const provider = withRefs('acme_core', [
            ref('orbit_finance', 'stable'),
        ]);
        const provided = result('acme_core');
        provided.manifest.nodes = Object.fromEntries(
            [1, 2].map((version) => {
                const node = {
                    ...model('acme_core'),
                    unique_id: `model.acme_core.orders.v${version}`,
                    version,
                    latest_version: 2,
                    refs:
                        version === 1
                            ? [{ package: 'orbit_finance', name: 'stable' }]
                            : [],
                    depends_on: {
                        nodes:
                            version === 1 ? ['model.orbit_finance.stable'] : [],
                    },
                };
                return [node.unique_id, node];
            }),
        );
        provider.fetch.mockResolvedValue(provided);
        const refs = [
            ref('acme_core', 'orders', '1'),
            ...(implicitSibling ? [ref('acme_core')] : []),
        ];
        const consumer = withRefs('orbit_finance', refs, ['stable', 'orders']);
        consumer.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = boundResult('orbit_finance', externalNodes, [
                ref('acme_core', 'orders', '1'),
            ]);
            const own = fetched.manifest.nodes['model.orbit_finance.orders'];
            fetched.manifest.nodes['model.orbit_finance.stable'] = {
                ...own,
                name: 'stable',
                unique_id: 'model.orbit_finance.stable',
            } as DbtRawModelNode & DbtManifest['nodes'][string];
            delete fetched.manifest.nodes['model.orbit_finance.orders'];
            if (implicitSibling) {
                const implicit = boundResult('orbit_finance', externalNodes, [
                    ref('acme_core'),
                ]);
                fetched.manifest.nodes['model.orbit_finance.orders'] =
                    implicit.manifest.nodes['model.orbit_finance.orders'];
            }
            return fetched;
        });
        await expect(
            resolveCrossSourceManifests({
                tasks: [consumer, provider],
                enabled: true,
                concurrency: 2,
                maxPasses: 1,
                cache: [
                    {
                        key: provider.key,
                        projectName: provider.key,
                        referencedProjects: [],
                        nodes: [1, 2].map((version) =>
                            placeholderExternalNode({
                                packageName: provider.key,
                                name: 'orders',
                                version: String(version),
                                latestVersion: '1',
                            }),
                        ),
                    },
                ],
            }),
        ).rejects.toThrow(
            'model.orbit_finance.stable -> model.acme_core.orders.v1 -> model.orbit_finance.stable',
        );
        expect(consumer.fetch).toHaveBeenCalledOnce();
        expect(provider.fetch).toHaveBeenCalledOnce();
    },
);

it.each([false, true])(
    'rechecks stale bindings with a local pinned ref: %s',
    async (localPinned) => {
        const provider = withRefs('acme_core', [
            ref('orbit_finance', 'reporting'),
        ]);
        const provided = result('acme_core');
        provided.manifest.nodes = Object.fromEntries(
            [1, 2].map((version) => {
                const node = {
                    ...model('acme_core'),
                    unique_id: `model.acme_core.orders.v${version}`,
                    version,
                    latest_version: 2,
                    depends_on: {
                        nodes:
                            version === 1
                                ? ['model.orbit_finance.reporting']
                                : [],
                    },
                };
                return [node.unique_id, node];
            }),
        );
        provider.fetch.mockResolvedValue(provided);
        const consumer = withRefs(
            'orbit_finance',
            [ref('acme_core')],
            ['reporting', 'orders'],
        );
        consumer.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = boundResult('orbit_finance', externalNodes, [
                ref('acme_core'),
            ]);
            const own = fetched.manifest.nodes[
                'model.orbit_finance.orders'
            ] as DbtRawModelNode & DbtManifest['nodes'][string];
            delete fetched.manifest.nodes['model.orbit_finance.orders'];
            fetched.manifest.nodes['model.orbit_finance.reporting'] =
                Object.assign(own, {
                    name: 'reporting',
                    unique_id: 'model.orbit_finance.reporting',
                });
            if (localPinned) {
                const local = Object.assign(model('orbit_finance'), {
                    unique_id: 'model.orbit_finance.orders.v1',
                    version: 1,
                    latest_version: 1,
                });
                fetched.manifest.nodes[local.unique_id] = local;
                own.refs!.push({ package: null, name: 'orders', version: 1 });
                own.depends_on!.nodes!.push(local.unique_id);
            }
            return fetched;
        });
        const resolution = await resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            cache: [
                {
                    key: provider.key,
                    projectName: provider.key,
                    referencedProjects: [],
                    nodes: [1, 2].map((version) =>
                        placeholderExternalNode({
                            packageName: provider.key,
                            name: 'orders',
                            version: String(version),
                            latestVersion: '1',
                        }),
                    ),
                },
            ],
        });
        expect(resolution.passes).toBe(2);
        expect(consumer.fetch).toHaveBeenCalledTimes(2);
    },
);

it.each(['deleted', 'private'])(
    'rejects a %s fresh model with consumer, model, ref and provider before another fetch',
    async (condition) => {
        const consumer = withRefs('b', [ref('a')]);
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('b', externalNodes, [ref('a')]),
        );
        const provided = result('a');
        if (condition === 'deleted') provided.manifest.nodes = {};
        else
            (
                provided.manifest.nodes['model.a.orders'] as DbtRawModelNode
            ).access = 'private';
        const provider = scannedTask('a');
        provider.fetch.mockResolvedValue(provided);
        const resolution = resolve([consumer, provider]);
        await Promise.all(
            [
                'Model "orders"',
                'dbt source "b"',
                "ref('a', 'orders')",
                'dbt source "a"',
                condition === 'private'
                    ? 'private'
                    : 'does not define that model (or version)',
            ].map((text) => expect(resolution).rejects.toThrow(text)),
        );
        expect(consumer.fetch).toHaveBeenCalledTimes(1);
    },
);

it('learns a hidden versioned ref from dbt and resolves it in pass two', async () => {
    const consumer = withRefs('b', []);
    consumer.fetch
        .mockRejectedValueOnce(
            new DbtError(
                "depends on a node named 'orders' with version '2' in package or project 'a' which was not found",
            ),
        )
        .mockResolvedValue(result('b'));
    const provider = scannedTask('a');
    provider.fetch
        .mockRejectedValueOnce(missing('b', 'base'))
        .mockResolvedValue(result('a'));
    const resolved = await resolve([consumer, provider]);
    expect(resolved.passes).toBe(2);
    expect(consumer.fetch.mock.calls[1][0].externalNodes).toEqual([
        expect.objectContaining({
            name: 'orders',
            version: '2',
            latest_version: '2',
        }),
    ]);
    expect(resolved.stubs?.error).toBe(2);
});

it('resolves a unique one-argument provider and warns to make the ref explicit', async () => {
    const consumer = withRefs('b', [ref(null)], ['uses']);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref(null)]),
    );
    const resolved = await resolve([consumer, scannedTask('a')]);
    expect(resolved.passes).toBe(1);
    expect(resolved.warnings).toEqual([
        expect.stringContaining("ref('a', 'orders')"),
    ]);
});

describe('one-argument refs with same-named models in several sources', () => {
    const provider = (key: string, names = ['m']) => {
        const source = withRefs(key, [], names);
        const fetched = result(key);
        fetched.manifest.nodes = Object.fromEntries(
            names.map((name) => {
                const node = model(key, name);
                return [node.unique_id, node];
            }),
        );
        source.fetch.mockResolvedValue(fetched);
        return source;
    };
    const consumer = (refs: DbtProjectScan['refs']) => {
        const names = refs.map((_, index) => `uses_${index}`);
        const source = withRefs('consumer', refs, names);
        source.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = result('consumer');
            fetched.manifest.nodes = {};
            refs.forEach((reference, index) => {
                if (
                    reference.packageName === null &&
                    !externalNodes.some((node) => node.name === reference.name)
                )
                    throw new DbtError(
                        `depends on a node named '${reference.name}' which was not found`,
                    );
                const bound = boundResult('consumer', externalNodes, [
                    reference,
                ]);
                const own = bound.manifest.nodes[
                    'model.consumer.orders'
                ] as DbtRawModelNode;
                delete bound.manifest.nodes[own.unique_id];
                const node = {
                    ...own,
                    name: names[index],
                    unique_id: `model.consumer.${names[index]}`,
                };
                Object.assign(fetched.manifest.nodes, bound.manifest.nodes, {
                    [node.unique_id]: node,
                });
            });
            return fetched;
        });
        return source;
    };

    it.each([
        { scenario: 'P1', oneArg: true, usesPrimary: true },
        { scenario: 'P3', oneArg: true, usesPrimary: false },
        { scenario: 'P5', oneArg: false, usesPrimary: true },
    ])('resolves $scenario in one pass', async ({ oneArg, usesPrimary }) => {
        const source = consumer([
            ref(oneArg ? null : 'up_one', 'm'),
            ref('up_one', 'm'),
            ...(usesPrimary ? [ref('primary', 'other_model')] : []),
        ]);
        const primary = provider('primary', ['m', 'other_model']);
        const upstream = provider('up_one');
        const resolution = await resolve([primary, upstream, source]);
        expect(resolution.passes).toBe(1);
        expect(resolution.contradictions).toBe(0);
        for (const entry of [primary, upstream, source])
            expect(entry.fetch).toHaveBeenCalledTimes(1);
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ package_name: 'up_one', name: 'm' }),
            ]),
        );
        expect(source.fetch.mock.calls[0][0].externalNodes).not.toContainEqual(
            expect.objectContaining({ package_name: 'primary', name: 'm' }),
        );
        const resolved = resolution.results.find(
            (entry) => entry.task.key === 'consumer',
        )!;
        for (const name of ['uses_0', 'uses_1'])
            expect(
                (
                    resolved.result.manifest.nodes[
                        `model.consumer.${name}`
                    ] as DbtRawModelNode
                ).depends_on?.nodes,
            ).toEqual(['model.up_one.m']);
    });

    it('rejects P2 ambiguity without an explicit ref to m', async () => {
        const source = consumer([ref(null, 'm')]);
        await expect(
            resolve([provider('primary'), provider('up_one'), source]),
        ).rejects.toThrow(
            "name 'm' is defined by several dbt sources. Use ref('project', 'model')",
        );
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    });

    it('rejects a late-discovered duplicate without an explicit ref to m', async () => {
        const source = consumer([ref(null, 'm')]);
        const hidden = provider('primary');
        hidden.prepare.mockResolvedValue({
            ...(await hidden.prepare()),
            localModels: [],
        });
        await expect(
            resolve([source, provider('up_one'), hidden]),
        ).rejects.toThrow(
            "name 'm' is defined by several dbt sources. Use ref('project', 'model')",
        );
        expect(source.fetch).toHaveBeenCalledTimes(2);
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual([
            expect.objectContaining({ package_name: 'up_one', name: 'm' }),
        ]);
        expect(source.fetch.mock.calls[1][0].externalNodes).toEqual([]);
    });

    it('names the injected binding provider when another source contradicts a one-argument ref', async () => {
        const source = consumer([ref(null, 'm')]);
        const hidden = provider('primary');
        hidden.prepare.mockResolvedValue({
            ...(await hidden.prepare()),
            localModels: [],
        });
        await expect(
            resolveCrossSourceManifests({
                tasks: [source, provider('up_one'), hidden],
                enabled: true,
                concurrency: 2,
                maxPasses: 1,
            }),
        ).rejects.toMatchObject({
            message:
                'dbt source "consumer" was compiled against an out-of-date version of model "m" from dbt source "up_one" and the compile ran out of retries.',
        });
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual([
            expect.objectContaining({ package_name: 'up_one', name: 'm' }),
        ]);
    });

    it('falls back to the compared provider when no injected binding supplies the ref', async () => {
        const source = withRefs('consumer', [], ['uses']);
        source.fetch.mockImplementation(async () =>
            boundResult(
                'consumer',
                [
                    placeholderExternalNode({
                        packageName: 'up_one',
                        name: 'm',
                        version: null,
                        latestVersion: null,
                    }),
                ],
                [ref(null, 'm')],
            ),
        );
        await expect(
            resolveCrossSourceManifests({
                tasks: [source, provider('primary')],
                enabled: true,
                concurrency: 2,
                maxPasses: 1,
            }),
        ).rejects.toMatchObject({
            message:
                'dbt source "consumer" was compiled against an out-of-date version of model "m" from dbt source "primary" and the compile ran out of retries.',
        });
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    });
});

it.each(['ambiguous', 'local', 'installed'])(
    'does not emit one-argument stubs when the name is %s',
    async (condition) => {
        const consumer = withRefs(
            'b',
            [ref(null)],
            condition === 'local' ? ['orders'] : ['uses'],
        );
        if (condition === 'installed')
            consumer.prepare.mockResolvedValue({
                ...(await consumer.prepare()),
                installedPackageModels: ['orders'],
            });
        await resolve([
            consumer,
            scannedTask('a'),
            ...(condition === 'ambiguous' ? [scannedTask('c')] : []),
        ]);
        expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    },
);

it('aggregates unresolved refs at the configured pass cap', async () => {
    const a = withRefs('a', []);
    const b = withRefs('b', []);
    a.fetch.mockRejectedValue(missing('unknown', 'gone'));
    b.fetch.mockRejectedValue(
        new DbtError("depends on a node named 'hidden' which was not found"),
    );
    const resolution = resolveCrossSourceManifests({
        tasks: [a, b],
        enabled: true,
        concurrency: 2,
        maxPasses: 1,
    });
    await Promise.all(
        [
            'dbt source "a"',
            "ref('unknown', 'gone')",
            'no connected dbt source provides project',
            'dbt source "b"',
            "ref('project', 'model')",
        ].map((text) => expect(resolution).rejects.toThrow(text)),
    );
    await expect(resolution).rejects.not.toThrow('DBT_');
});

it('reports a node-level cycle in node order', async () => {
    const tasks = ['a', 'b', 'c'].map((key, index, keys) => {
        const refs = [ref(keys[(index + 1) % keys.length])];
        const source = withRefs(key, refs);
        source.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult(key, externalNodes, refs),
        );
        return source;
    });
    await expect(resolve(tasks)).rejects.toThrow(
        'model.a.orders -> model.b.orders -> model.c.orders -> model.a.orders',
    );
});

it.each([1, 2])(
    'rejects a model cycle in pass %s before retrying contradicted stubs',
    async (cyclePass) => {
        const projects = ['acme_core', 'orbit_finance', 'nova_ledger'];
        const tasks = projects.map((key, index) => {
            const upstream = projects[(index + 1) % projects.length];
            const refs = [ref(upstream)];
            const source = withRefs(key, refs);
            source.fetch.mockImplementation(async ({ externalNodes }) =>
                boundResult(key, externalNodes, refs),
            );
            if (cyclePass === 2)
                source.fetch.mockRejectedValueOnce(missing(upstream));
            return source;
        });
        const dynamic = task('lunar_audit');
        dynamic.fetch
            .mockRejectedValueOnce(missing('acme_core'))
            .mockRejectedValueOnce(missing('nova_ledger'));
        const onSourceFinal = vi.fn();
        await expect(
            resolveCrossSourceManifests({
                tasks: [...tasks, dynamic],
                enabled: true,
                concurrency: 2,
                onSourceFinal,
            }),
        ).rejects.toThrow(
            'dbt models form a cycle across dbt sources: model.acme_core.orders -> model.orbit_finance.orders -> model.nova_ledger.orders -> model.acme_core.orders. Break the cycle in one of these models.',
        );
        tasks.forEach((source) =>
            expect(source.fetch).toHaveBeenCalledTimes(cyclePass),
        );
        expect(dynamic.fetch).toHaveBeenCalledTimes(cyclePass);
        expect(onSourceFinal).not.toHaveBeenCalled();
    },
);

it('reports the failed provider and its root cause to a dependent source', async () => {
    const consumer = withRefs('b', [ref('a')]);
    const provider = scannedTask('a');
    provider.fetch.mockRejectedValue(new Error('bad profile configuration'));
    const resolution = resolve([consumer, provider]);
    await Promise.all(
        ['dbt source "b"', 'dbt source "a"', 'bad profile configuration'].map(
            (text) => expect(resolution).rejects.toThrow(text),
        ),
    );
});

it('rejects duplicate scanned project names before a fetch', async () => {
    const a = scannedTask('a');
    const b = scannedTask('b');
    b.prepare.mockResolvedValue({ ...(await b.prepare()), projectName: 'a' });
    await expect(resolve([a, b])).rejects.toThrow(
        'both use the dbt project name "a"',
    );
    expect(a.fetch).not.toHaveBeenCalled();
    expect(b.fetch).not.toHaveBeenCalled();
});

it('keeps the late duplicate-name guard for scan-less sources', async () => {
    await expect(
        resolve([
            task('a'),
            task(
                'b',
                vi.fn(async () => result('a')),
            ),
        ]),
    ).rejects.toThrow('both use the dbt project name "a"');
});

it('never mixes unversioned and versioned placeholders for one model', async () => {
    const consumer = withRefs('b', [
        ref('a'),
        ref('a', 'orders', '1'),
        ref('a', 'orders', '2'),
    ]);
    await resolve([consumer, scannedTask('a')]);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([
        expect.objectContaining({ version: '1', latest_version: '2' }),
        expect.objectContaining({ version: '2', latest_version: '2' }),
    ]);
});

it('waits for failed source cancellation and fences callbacks from late success', async () => {
    const onSourceResolved = vi.fn();
    const late = task(
        'a',
        vi.fn(
            async ({ signal }) =>
                new Promise<ReturnType<typeof result>>((done) => {
                    signal!.addEventListener('abort', () => done(result('a')), {
                        once: true,
                    });
                }),
        ),
    );
    const error = new Error('bad profile');
    const failure = task('b', vi.fn().mockRejectedValue(error));
    await expect(
        resolveCrossSourceManifests({
            tasks: [late, failure],
            enabled: true,
            concurrency: 2,
            onSourceResolved,
        }),
    ).rejects.toBe(error);
    expect(onSourceResolved).not.toHaveBeenCalled();
});

it('does not inject cached copies of the consumer or its installed packages', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.prepare.mockResolvedValue({
        ...(await consumer.prepare()),
        installedPackages: ['installed'],
    });
    const nodes = ['a', 'b', 'installed'].map((packageName) =>
        placeholderExternalNode({
            packageName,
            name: 'orders',
            version: null,
            latestVersion: null,
        }),
    );
    await resolveCrossSourceManifests({
        tasks: [consumer, scannedTask('a')],
        enabled: true,
        concurrency: 2,
        cache: [{ key: 'a', projectName: 'a', referencedProjects: [], nodes }],
    });
    expect(
        consumer.fetch.mock.calls[0][0].externalNodes.map(
            (node) => node.package_name,
        ),
    ).toEqual(['a']);
});

it('reports a contradicted binding accurately when the pass cap prevents validation', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref('a')]),
    );
    const provider = scannedTask('a');
    const provided = result('a');
    (provided.manifest.nodes['model.a.orders'] as DbtRawModelNode).access =
        'protected';
    provider.fetch.mockResolvedValue(provided);
    await expect(
        resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            maxPasses: 1,
        }),
    ).rejects.toMatchObject({
        message:
            'dbt source "b" was compiled against an out-of-date version of model "orders" from dbt source "a" and the compile ran out of retries.',
    });
    expect(consumer.fetch).toHaveBeenCalledTimes(1);
});

it.each(['scanned', 'declared', 'cached'])(
    'injects only providers referenced by the %s consumer on a warm run',
    async (kind) => {
        const consumer = withRefs(
            'consumer',
            kind === 'scanned' ? [ref('provider')] : [],
        );
        if (kind === 'declared')
            consumer.prepare.mockResolvedValue({
                ...(await consumer.prepare()),
                declaredUpstreams: ['provider'],
            });
        const provided = result('provider');
        const extra = model('provider', 'extra');
        provided.manifest.nodes[extra.unique_id] = extra;
        const provider = scannedTask('provider');
        provider.fetch.mockResolvedValue(provided);
        const unrelated = scannedTask('unrelated');
        const nodes = ['orders', 'extra'].map((name) =>
            placeholderExternalNode({
                packageName: 'provider',
                name,
                version: null,
                latestVersion: null,
            }),
        );
        const onSourceResolved = vi.fn();
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('consumer', externalNodes, [ref('provider')]),
        );
        const resolution = await resolveCrossSourceManifests({
            tasks: [consumer, provider, unrelated],
            enabled: true,
            concurrency: 3,
            cache: [
                {
                    key: 'consumer',
                    projectName: 'consumer',
                    nodes: [],
                    referencedProjects: kind === 'cached' ? ['provider'] : [],
                },
                {
                    key: 'provider',
                    projectName: 'provider',
                    nodes,
                    referencedProjects: [],
                },
                {
                    key: 'unrelated',
                    projectName: 'unrelated',
                    nodes: [
                        placeholderExternalNode({
                            packageName: 'unrelated',
                            name: 'orders',
                            version: null,
                            latestVersion: null,
                        }),
                    ],
                    referencedProjects: [],
                },
            ],
            onSourceResolved,
        });
        expect(resolution.passes).toBe(1);
        expect(resolution.contradictions).toBe(0);
        expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(nodes);
        expect(provider.fetch.mock.calls[0][0].externalNodes).toEqual([]);
        expect(unrelated.fetch.mock.calls[0][0].externalNodes).toEqual([]);
        expect(
            resolution.sources?.map(({ key, injectedStubs }) => ({
                key,
                injectedStubs,
            })),
        ).toEqual([
            { key: 'consumer', injectedStubs: 2 },
            { key: 'provider', injectedStubs: 0 },
            { key: 'unrelated', injectedStubs: 0 },
        ]);
        expect(onSourceResolved).toHaveBeenCalledWith(
            expect.objectContaining({
                task: consumer,
                referencedProjects: ['provider'],
            }),
        );
    },
);

it('learns a new hidden provider on a warm run and records its actual dependencies', async () => {
    const consumer = withRefs('consumer', []);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const provider = scannedTask('provider');
    const onSourceResolved = vi.fn();
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, provider, scannedTask('unrelated')],
        enabled: true,
        concurrency: 2,
        cache: [
            {
                key: 'consumer',
                projectName: 'consumer',
                nodes: [],
                referencedProjects: [],
            },
            {
                key: 'provider',
                projectName: 'provider',
                nodes: [
                    placeholderExternalNode({
                        packageName: 'provider',
                        name: 'orders',
                        version: null,
                        latestVersion: null,
                    }),
                ],
                referencedProjects: [],
            },
        ],
        onSourceResolved,
    });
    expect(resolution.passes).toBe(2);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    expect(consumer.fetch.mock.calls[1][0].externalNodes).toEqual([
        expect.objectContaining({ package_name: 'provider', name: 'orders' }),
    ]);
    expect(onSourceResolved).toHaveBeenCalledWith(
        expect.objectContaining({
            task: consumer,
            referencedProjects: ['provider'],
        }),
    );
    expect(
        resolution.sources?.find(({ key }) => key === 'consumer'),
    ).toMatchObject({ injectedStubs: 1, lsRuns: 2 });
});

it('validates a fresh provider learned from a hidden ref on a later pass', async () => {
    const consumer = withRefs('consumer', []);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const provider = scannedTask('provider');
    const provided = result('provider');
    (
        provided.manifest.nodes['model.provider.orders'] as DbtRawModelNode
    ).access = 'private';
    provider.fetch.mockResolvedValue(provided);
    await expect(resolve([consumer, provider])).rejects.toThrow(
        'defines that model as private',
    );
    expect(consumer.fetch).toHaveBeenCalledTimes(2);
});

it('injects all versions of only the named model for one-argument refs', async () => {
    const consumer = withRefs('consumer', [ref(null)], ['uses']);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult(
            'consumer',
            externalNodes,
            [ref(null)],
            ['model.provider.orders.v2'],
        ),
    );
    const provider = scannedTask('provider');
    const provided = result('provider');
    provided.manifest.nodes = Object.fromEntries(
        [1, 2].map((version) => {
            const node = {
                ...model('provider'),
                unique_id: `model.provider.orders.v${version}`,
                version,
                latest_version: 2,
            };
            return [node.unique_id, node];
        }),
    );
    const extra = model('provider', 'extra');
    provided.manifest.nodes[extra.unique_id] = extra;
    provider.fetch.mockResolvedValue(provided);
    const nodes = [1, 2].map((version) =>
        placeholderExternalNode({
            packageName: 'provider',
            name: 'orders',
            version: String(version),
            latestVersion: '2',
        }),
    );
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        cache: [
            {
                key: 'provider',
                projectName: 'provider',
                nodes: [
                    ...nodes,
                    placeholderExternalNode({
                        packageName: 'provider',
                        name: 'extra',
                        version: null,
                        latestVersion: null,
                    }),
                ],
                referencedProjects: [],
            },
        ],
    });
    expect(resolution.passes).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(nodes);
    expect(resolution.stubs?.cached).toBe(2);
});

it('accepts a shared installed package with the same model name as an explicit provider ref', async () => {
    const refs = [ref('p', 'm')];
    const consumer = withRefs('c', refs);
    consumer.prepare.mockResolvedValue({
        ...(await consumer.prepare()),
        installedPackages: ['x'],
        installedPackageModels: ['m'],
    });
    consumer.fetch.mockImplementation(async ({ externalNodes }) => {
        const fetched = boundResult('c', externalNodes, refs);
        fetched.manifest.nodes['model.x.m'] = model('x', 'm');
        return fetched;
    });
    const provider = withRefs('p', [], ['m']);
    provider.prepare.mockResolvedValue({
        ...(await provider.prepare()),
        installedPackages: ['x'],
        installedPackageModels: ['m'],
    });
    const provided = result('p');
    provided.manifest.nodes = Object.fromEntries(
        [model('p', 'm'), model('x', 'm')].map((node) => [
            node.unique_id,
            node,
        ]),
    );
    provider.fetch.mockResolvedValue(provided);
    const resolution = await resolve([consumer, provider]);
    expect(resolution.passes).toBe(1);
    expect(resolution.contradictions).toBe(0);
    expect(consumer.fetch).toHaveBeenCalledTimes(1);
});

it.each(['deleted', 'private'])(
    'validates a %s provider model referenced by a snapshot',
    async (condition) => {
        const refs = [ref('p', 'm')];
        const consumer = withRefs('c', refs);
        consumer.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = boundResult('c', externalNodes, refs);
            const own = fetched.manifest.nodes['model.c.orders'];
            delete fetched.manifest.nodes['model.c.orders'];
            const snapshot = {
                ...own,
                name: 's',
                unique_id: 'snapshot.c.s',
                resource_type: 'snapshot',
            };
            fetched.manifest.nodes['snapshot.c.s'] = snapshot;
            return fetched;
        });
        const provider = withRefs('p', [], ['m']);
        const provided = result('p');
        provided.manifest.nodes =
            condition === 'deleted'
                ? {}
                : {
                      'model.p.m': Object.assign(model('p', 'm'), {
                          access: 'private',
                      }),
                  };
        provider.fetch.mockResolvedValue(provided);
        await expect(resolve([consumer, provider])).rejects.toThrow(
            `Model "s" in dbt source "c" references ref('p', 'm'), but dbt source "p" ${condition === 'deleted' ? 'does not define that model (or version)' : 'defines that model as private'}.`,
        );
        expect(consumer.fetch).toHaveBeenCalledTimes(1);
    },
);

it('rejects a cycle through a snapshot with its node path', async () => {
    const a = withRefs('a', [ref('b', 'm')], ['m']);
    const b = withRefs('b', [ref('a', 'm')], ['m']);
    a.fetch.mockImplementation(async ({ externalNodes }) => {
        const fetched = boundResult('a', externalNodes, [ref('b', 'm')]);
        const own = fetched.manifest.nodes['model.a.orders'];
        delete fetched.manifest.nodes['model.a.orders'];
        const renamed = { ...own, unique_id: 'model.a.m', name: 'm' };
        fetched.manifest.nodes['model.a.m'] = renamed;
        return fetched;
    });
    b.fetch.mockImplementation(async ({ externalNodes }) => {
        const fetched = boundResult('b', externalNodes, [ref('a', 'm')]);
        const own = fetched.manifest.nodes['model.b.orders'];
        delete fetched.manifest.nodes['model.b.orders'];
        const snapshot = {
            ...own,
            unique_id: 'snapshot.b.s',
            name: 's',
            resource_type: 'snapshot',
        };
        fetched.manifest.nodes['snapshot.b.s'] = snapshot;
        fetched.manifest.nodes['model.b.m'] = Object.assign(model('b', 'm'), {
            depends_on: { nodes: ['snapshot.b.s'] },
        });
        return fetched;
    });
    await expect(resolve([a, b])).rejects.toThrow(
        'model.a.m -> model.b.m -> snapshot.b.s -> model.a.m',
    );
});

it('names only the contradicted refs at the retry cap', async () => {
    const refs = [ref('p', 'm'), ref('q', 'stable')];
    const consumer = withRefs('c', refs);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('c', externalNodes, refs),
    );
    const p = withRefs('p', [], ['m']);
    const q = withRefs('q', [], ['stable']);
    p.fetch.mockResolvedValue({
        ...result('p'),
        manifest: {
            ...manifest('p'),
            nodes: {
                'model.p.m': Object.assign(model('p', 'm'), {
                    access: 'protected',
                }),
            },
        },
    });
    q.fetch.mockResolvedValue({
        ...result('q'),
        manifest: {
            ...manifest('q'),
            nodes: { 'model.q.stable': model('q', 'stable') },
        },
    });
    const resolution = resolveCrossSourceManifests({
        tasks: [consumer, p, q],
        enabled: true,
        concurrency: 2,
        maxPasses: 1,
    });
    await expect(resolution).rejects.toThrow('model "m" from dbt source "p"');
    await expect(resolution).rejects.not.toThrow('stable');
    await expect(resolution).rejects.not.toThrow('dbt source "q"');
});

it('restores the clear error for a single missing provider', async () => {
    const consumer = withRefs('analytics', []);
    consumer.fetch.mockRejectedValue(missing('shared_dimensions', 'calendar'));
    await expect(resolve([consumer])).rejects.toThrow(
        `dbt source "analytics" references ref('shared_dimensions', 'calendar'), but no connected dbt source provides project "shared_dimensions".`,
    );
});

it('groups each missing provider ref by its source', async () => {
    const a = withRefs('a', []);
    const b = withRefs('b', []);
    a.fetch.mockRejectedValue(
        new DbtError(
            [missing('p', 'm').message, missing('q', 'n').message].join('\n'),
        ),
    );
    b.fetch.mockRejectedValue(missing('r', 'o'));
    await expect(resolve([a, b])).rejects.toThrow(
        [
            `dbt source "a" references ref('p', 'm'), but no connected dbt source provides project "p".`,
            `dbt source "a" references ref('q', 'n'), but no connected dbt source provides project "q".`,
            `dbt source "b" references ref('r', 'o'), but no connected dbt source provides project "r".`,
        ].join(' '),
    );
});

it('reports only the contradicted version of a model at the retry cap', async () => {
    const refs = [ref('p', 'm', '1'), ref('p', 'm', '2')];
    const consumer = withRefs('c', refs);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('c', externalNodes, refs, ['model.p.m.v1', 'model.p.m.v2']),
    );
    const provider = withRefs('p', [], ['m']);
    const provided = result('p');
    provided.manifest.nodes = Object.fromEntries(
        [1, 2].map((version) => {
            const node = {
                ...model('p', 'm'),
                unique_id: `model.p.m.v${version}`,
                version,
                latest_version: 2,
                access: version === 1 ? 'protected' : 'public',
            };
            return [node.unique_id, node];
        }),
    );
    provider.fetch.mockResolvedValue(provided);
    const nodes = [1, 2].map((version) =>
        placeholderExternalNode({
            packageName: 'p',
            name: 'm',
            version: String(version),
            latestVersion: '2',
        }),
    );
    const resolution = resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        maxPasses: 1,
        cache: [{ key: 'p', projectName: 'p', nodes, referencedProjects: [] }],
    });
    await expect(resolution).rejects.toMatchObject({
        message:
            'dbt source "c" was compiled against an out-of-date version of model "m" (version "1") from dbt source "p" and the compile ran out of retries.',
    });
    await expect(resolution).rejects.not.toThrow('version "2"');
});

describe('source final callback', () => {
    it('finalizes the provider after pass one and a contradicted consumer only after pass two', async () => {
        const provider = scannedTask('provider');
        const provided = result('provider');
        (
            provided.manifest.nodes['model.provider.orders'] as DbtRawModelNode
        ).access = 'protected';
        provider.fetch.mockResolvedValue(provided);
        const consumer = withRefs('consumer', [ref('provider')]);
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('consumer', externalNodes, [ref('provider')]),
        );
        const final = vi.fn();
        const rounds: string[][] = [];
        const resolution = await resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            cache: [
                {
                    key: 'provider',
                    projectName: 'provider',
                    referencedProjects: [],
                    nodes: [
                        placeholderExternalNode({
                            packageName: 'provider',
                            name: 'orders',
                            version: null,
                            latestVersion: null,
                        }),
                    ],
                },
            ],
            onSourceFinal: (source) => {
                final(
                    source.key,
                    consumer.fetch.mock.calls.length,
                    provider.fetch.mock.calls.length,
                );
            },
            onRoundComplete: () => {
                rounds.push(final.mock.calls.map(([key]) => key));
            },
        });
        expect(resolution.passes).toBe(2);
        expect(resolution.contradictions).toBe(1);
        expect(rounds).toEqual([['provider'], ['provider', 'consumer']]);
        expect(final.mock.calls).toEqual([
            ['provider', 1, 1],
            ['consumer', 2, 1],
        ]);
    });

    it('keeps consumers available while a fresh provider still needs another pass', async () => {
        const provider = withRefs('provider', [ref('root')]);
        provider.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('provider', externalNodes, [ref('root')]),
        );
        const root = scannedTask('root');
        const provided = result('root');
        (
            provided.manifest.nodes['model.root.orders'] as DbtRawModelNode
        ).access = 'protected';
        root.fetch.mockResolvedValue(provided);
        const consumer = withRefs('consumer', [ref('provider')]);
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('consumer', externalNodes, [ref('provider')]),
        );
        const final = vi.fn();
        const rounds: string[][] = [];
        await resolveCrossSourceManifests({
            tasks: [consumer, provider, root],
            enabled: true,
            concurrency: 3,
            cache: ['provider', 'root'].map((key) => ({
                key,
                projectName: key,
                referencedProjects: [],
                nodes: [
                    placeholderExternalNode({
                        packageName: key,
                        name: 'orders',
                        version: null,
                        latestVersion: null,
                    }),
                ],
            })),
            onSourceFinal: final,
            onRoundComplete: () => {
                rounds.push(final.mock.calls.map(([item]) => item.key).sort());
            },
        });
        expect(rounds).toEqual([['root'], ['consumer', 'provider', 'root']]);
        expect(consumer.fetch).toHaveBeenCalledOnce();
        expect(provider.fetch).toHaveBeenCalledTimes(2);
    });

    it('calls once after the successful retry and skips sources that never resolve', async () => {
        const final = vi.fn();
        const leaf = task(
            'leaf_a',
            vi
                .fn()
                .mockRejectedValueOnce(missing('leaf_b'))
                .mockImplementationOnce(async () => {
                    expect(
                        final.mock.calls.map(([item]) => item.key),
                    ).not.toContain('leaf_a');
                    return result('leaf_a');
                }),
        );
        await resolveCrossSourceManifests({
            tasks: [leaf, task('leaf_b')],
            enabled: true,
            concurrency: 1,
            onSourceFinal: final,
        });
        expect(final.mock.calls.map(([item]) => item.key)).toEqual([
            'leaf_b',
            'leaf_a',
        ]);
        final.mockClear();
        await expect(
            resolveCrossSourceManifests({
                tasks: [
                    task(
                        'leaf_c',
                        vi.fn().mockRejectedValue(missing('unknown')),
                    ),
                ],
                enabled: true,
                concurrency: 1,
                onSourceFinal: final,
            }),
        ).rejects.toThrow();
        expect(final).not.toHaveBeenCalled();
    });
    it('ignores the callback when disabled', async () => {
        const final = vi.fn();
        await resolveCrossSourceManifests({
            tasks: [task('leaf_a')],
            enabled: false,
            concurrency: 1,
            onSourceFinal: final,
        });
        expect(final).not.toHaveBeenCalled();
    });
});

describe('source recreation deadline', () => {
    it.each(['projectName', 'declaredUpstreams'] as const)(
        'rejects a recreated source with a changed %s before fetching',
        async (field) => {
            const source: CrossSourceFetchTask<string> = scannedTask('leaf_a');
            const original = await source.prepare!();
            source.prepareFetch = vi.fn(async () => ({
                ...original!,
                [field]: field === 'projectName' ? 'renamed' : ['new_upstream'],
            }));
            const final = vi.fn();
            await expect(
                resolveCrossSourceManifests({
                    tasks: [source],
                    enabled: true,
                    concurrency: 1,
                    onSourceFinal: final,
                }),
            ).rejects.toThrow(
                'dbt source "leaf_a" changed while this project was compiling. Refresh dbt again.',
            );
            expect(source.fetch).not.toHaveBeenCalled();
            expect(final).not.toHaveBeenCalled();
        },
    );

    it('allows declared upstreams to be reordered when a source is recreated', async () => {
        const source: CrossSourceFetchTask<string> = scannedTask(
            'leaf_a',
            [],
            ['leaf_b', 'leaf_c'],
        );
        const original = await source.prepare!();
        source.prepareFetch = vi.fn(async () => ({
            ...original!,
            declaredUpstreams: ['leaf_c', 'leaf_b'],
        }));
        await resolve([source, scannedTask('leaf_b'), scannedTask('leaf_c')]);
        expect(source.fetch).toHaveBeenCalledOnce();
    });

    it('applies the prepare deadline before a re-created source can fetch', async () => {
        const leaf = task('leaf_a');
        leaf.prepareFetch = async ({ signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), {
                    once: true,
                });
            });
        const final = vi.fn();
        await expect(
            resolveCrossSourceManifests({
                tasks: [leaf],
                concurrency: 1,
                enabled: true,
                timeouts: { prepareMs: 10, lsMs: 1000, resolutionMs: 2000 },
                onSourceFinal: final,
            }),
        ).rejects.toThrow(
            'while cloning the repository and installing dbt packages',
        );
        expect(leaf.fetch).not.toHaveBeenCalled();
        expect(final).not.toHaveBeenCalled();
    });
});

it.each(['cached', 'fresh'])(
    'drops dangling provider dependencies from targeted %s injection',
    async (origin) => {
        const refs = [ref(null)];
        const consumer = withRefs('consumer', refs, ['uses']);
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('consumer', externalNodes, refs),
        );
        const provider = scannedTask('p');
        const provided = result('p');
        (
            provided.manifest.nodes['model.p.orders'] as DbtRawModelNode
        ).depends_on = {
            nodes: ['model.p.base'],
        };
        provided.manifest.nodes['model.p.base'] = model('p', 'base');
        provider.fetch.mockResolvedValue(provided);
        if (origin === 'fresh')
            consumer.prepare.mockResolvedValue({
                ...(await consumer.prepare()),
                refs: [],
            });
        if (origin === 'fresh')
            consumer.fetch.mockRejectedValueOnce(
                new DbtError(
                    "depends on a node named 'orders' which was not found",
                ),
            );
        await resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            cache:
                origin === 'cached'
                    ? [
                          {
                              key: 'p',
                              projectName: 'p',
                              referencedProjects: [],
                              nodes: [
                                  {
                                      ...placeholderExternalNode({
                                          packageName: 'p',
                                          name: 'orders',
                                          version: null,
                                          latestVersion: null,
                                      }),
                                      depends_on_nodes: ['model.p.base'],
                                  },
                              ],
                          },
                      ]
                    : [],
        });
        const injected = consumer.fetch.mock.calls.at(-1)![0].externalNodes;
        expect(injected).toHaveLength(1);
        expect(injected[0].depends_on_nodes).toEqual([]);
        expect(
            (provided.manifest.nodes['model.p.orders'] as DbtRawModelNode)
                .depends_on?.nodes,
        ).toEqual(['model.p.base']);
    },
);

it.each(['private', 'public'] as const)(
    'validates fresh access after injecting a permissive %s cache hint',
    async (cachedAccess) => {
        const refs = [ref('p')];
        const consumer = withRefs('consumer', refs, ['uses']);
        consumer.fetch.mockImplementation(async ({ externalNodes }) => {
            if (externalNodes.some((node) => node.access === 'private'))
                throw new DbtError('dbt rejected a private stub');
            return boundResult('consumer', externalNodes, refs);
        });
        const provider = scannedTask('p');
        const provided = result('p');
        (provided.manifest.nodes['model.p.orders'] as DbtRawModelNode).access =
            cachedAccess === 'private' ? 'public' : 'private';
        provider.fetch.mockResolvedValue(provided);
        const resolution = resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            cache: [
                {
                    key: 'p',
                    projectName: 'p',
                    referencedProjects: [],
                    nodes: [
                        {
                            ...placeholderExternalNode({
                                packageName: 'p',
                                name: 'orders',
                                version: null,
                                latestVersion: null,
                            }),
                            access: cachedAccess,
                        },
                    ],
                },
            ],
        });
        if (cachedAccess === 'private')
            expect((await resolution).passes).toBe(1);
        else
            await expect(resolution).rejects.toThrow(
                `Model "orders" in dbt source "consumer" references ref('p', 'orders'), but dbt source "p" defines that model as private.`,
            );
    },
);

it('selects different one-argument providers for disjoint requested versions', async () => {
    const refs = [ref(null, 'orders', '1'), ref(null, 'orders', '2')];
    const consumer = withRefs('consumer', refs, ['uses']);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, refs),
    );
    const providers = ['p', 'q'].map((key, index) => {
        const provider = scannedTask(key);
        const provided = result(key);
        const node = {
            ...model(key),
            version: index + 1,
            latest_version: index + 1,
            unique_id: `model.${key}.orders.v${index + 1}`,
        };
        provided.manifest.nodes = { [node.unique_id]: node };
        provider.fetch.mockResolvedValue(provided);
        return provider;
    });
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, ...providers],
        enabled: true,
        concurrency: 2,
        cache: ['p', 'q'].map((key, index) => ({
            key,
            projectName: key,
            referencedProjects: [],
            nodes: [
                placeholderExternalNode({
                    packageName: key,
                    name: 'orders',
                    version: String(index + 1),
                    latestVersion: String(index + 1),
                }),
            ],
        })),
    });
    expect(resolution.passes).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toHaveLength(2);
    expect(
        (
            resolution.results[0].result.manifest.nodes[
                'model.consumer.orders'
            ] as DbtRawModelNode
        ).depends_on?.nodes,
    ).toEqual(['model.p.orders.v1', 'model.q.orders.v2']);
});

it('explains ambiguous one-argument names without calling them hidden refs', async () => {
    const consumer = withRefs('consumer', [ref(null)], ['uses']);
    consumer.fetch.mockRejectedValue(
        new DbtError("depends on a node named 'orders' which was not found"),
    );
    const resolution = resolve([consumer, scannedTask('p'), scannedTask('q')]);
    await expect(resolution).rejects.toThrow(
        "name 'orders' is defined by several dbt sources. Use ref('project', 'model')",
    );
    await expect(resolution).rejects.not.toThrow(
        'could not be found before compiling',
    );
});
