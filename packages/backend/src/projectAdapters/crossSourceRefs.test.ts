import {
    DbtError,
    getExternalModelNodesFromManifest,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
import { type DbtProjectScan } from '../dbt/dbtProjectScan';
import Logger from '../logging/logger';
import { type DbtManifestFetchOptions } from '../types';
import {
    resolveCrossSourceManifests,
    type CrossSourceCatalog,
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
const seed = (key: string, nodes = [model(key)]): CrossSourceCatalog => ({
    key,
    projectName: key,
    referencedProjects: [],
    nodes: getExternalModelNodesFromManifest({
        ...manifest(key),
        nodes: Object.fromEntries(nodes.map((node) => [node.unique_id, node])),
    }),
});
const externalNode = ({
    packageName,
    name,
    version,
    latestVersion,
}: {
    packageName: string;
    name: string;
    version: string | null;
    latestVersion: string | null;
}) => ({
    ...seed(packageName, [model(packageName, name)]).nodes[0],
    version,
    latest_version: latestVersion,
});
const resolve = (
    tasks: CrossSourceFetchTask<string>[],
    enabled = true,
    concurrency = 2,
    cache: CrossSourceCatalog[] = [],
) => resolveCrossSourceManifests({ tasks, enabled, concurrency, cache });

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
    it('decorates every failed parse without retrying other unresolved refs', async () => {
        const leaf = scannedTask('leaf_a');
        const first = scannedTask('ring_0');
        first.fetch.mockRejectedValue(missing('leaf_a', 'absent'));
        const second = scannedTask('ring_1');
        second.fetch
            .mockRejectedValueOnce(missing('leaf_a', 'before'))
            .mockRejectedValueOnce(missing('leaf_a', 'after'));
        await expect(
            resolve([first, second, leaf], true, 2, [seed('leaf_a')]),
        ).rejects.toThrow('absent');
        expect(first.fetch).toHaveBeenCalledTimes(1);
        expect(second.fetch).toHaveBeenCalledTimes(1);
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
            cache: [seed('leaf_a')],
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

it('does not retry a hidden versioned ref after dbt reports it', async () => {
    const consumer = task(
        'consumer',
        vi
            .fn()
            .mockRejectedValueOnce(
                new DbtError(
                    "depends on a node named 'orders' with version '2' in package or project 'provider' which was not found",
                ),
            )
            .mockResolvedValue(result('consumer')),
    );
    await expect(
        resolve([consumer, scannedTask('provider')], true, 2, [
            seed('provider'),
        ]),
    ).rejects.toThrow("ref('provider', 'orders', v=2)");
    expect(consumer.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([]);
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
            cache: tasks.map((source) =>
                seed(source.key, [
                    model(source.key, 'base'),
                    model(source.key),
                ]),
            ),
        });
        expect(resolved.rounds).toBe(1);
        expect(resolved.attempts).toBe(count);
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
    expect((await resolve([a, b])).rounds).toBe(1);
});

it('uses confirmed relation metadata during the single parse', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref('a')]),
    );
    const cached = {
        ...externalNode({
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
    expect(resolved.rounds).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes[0].schema).toBe(
        'real_schema',
    );
});

it('ignores cache rows whose project name no longer matches the scan', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref('a')]),
    );
    const resolution = resolveCrossSourceManifests({
        tasks: [consumer, scannedTask('a')],
        enabled: true,
        concurrency: 2,
        cache: [
            {
                key: 'a',
                projectName: 'old_name',
                referencedProjects: [],
                nodes: [
                    externalNode({
                        packageName: 'old_name',
                        name: 'orders',
                        version: null,
                        latestVersion: null,
                    }),
                ],
            },
        ],
    });
    expect((await resolution).warnings).toEqual([
        expect.stringContaining('no confirmed last-good manifest'),
    ]);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(
        seed('a').nodes,
    );
    expect(consumer.fetch).toHaveBeenCalledOnce();
});

it('retains the seeded latest version when fresh disk changes it', async () => {
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
                externalNode({
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
    expect(resolved.rounds).toBe(1);
    expect(consumer.fetch).toHaveBeenCalledTimes(1);
    expect(provider.fetch).toHaveBeenCalledTimes(1);
    expect(
        (
            resolved.results[0].result.manifest.nodes[
                'model.b.orders'
            ] as DbtRawModelNode
        ).depends_on?.nodes,
    ).toEqual(['model.a.orders.v1']);
});

it.each(['deleted', 'private'])(
    'keeps the seed authoritative when the fresh provider model is %s',
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
        const resolution = await resolve([consumer, provider], true, 2, [
            seed('a'),
        ]);
        expect(resolution.rounds).toBe(1);
        expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(
            seed('a').nodes,
        );
        expect(consumer.fetch).toHaveBeenCalledTimes(1);
    },
);

it('uses a declared provider whole surface for a hidden versioned ref in one parse', async () => {
    const consumer = withRefs('consumer', []);
    consumer.prepare.mockResolvedValue({
        ...(await consumer.prepare()),
        declaredUpstreams: ['provider'],
    });
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [
            ref('provider', 'orders', '2'),
        ]),
    );
    const provider = scannedTask('provider');
    await resolve([consumer, provider], true, 2, [
        seed('provider', [
            {
                ...model('provider'),
                unique_id: 'model.provider.orders.v2',
                version: 2,
                latest_version: 2,
            },
        ]),
    ]);
    expect(consumer.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([
        expect.objectContaining({ version: 2 }),
    ]);
});

it('resolves a unique one-argument provider and warns to make the ref explicit', async () => {
    const consumer = withRefs('b', [ref(null)], ['uses']);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref(null)]),
    );
    const resolved = await resolve([consumer, scannedTask('a')], true, 2, [
        seed('a'),
    ]);
    expect(resolved.rounds).toBe(1);
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
        { scenario: 'explicit providers', oneArg: false, usesPrimary: true },
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
        const resolution = await resolve([primary, upstream, source], true, 2, [
            seed('primary', [
                model('primary', 'm'),
                model('primary', 'other_model'),
            ]),
            seed('up_one', [model('up_one', 'm')]),
        ]);
        expect(resolution.rounds).toBe(1);
        for (const entry of [primary, upstream, source])
            expect(entry.fetch).toHaveBeenCalledTimes(1);
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ package_name: 'up_one', name: 'm' }),
            ]),
        );
        expect(
            source.fetch.mock.calls[0][0].externalNodes.some(
                (node) => node.package_name === 'primary' && node.name === 'm',
            ),
        ).toBe(usesPrimary);
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

    it('rejects a real ambiguous one-argument ref even when an unrelated explicit ref selects one public provider', async () => {
        const source = consumer([
            ref(null, 'm'),
            ref('primary', 'other_model'),
        ]);
        await expect(
            resolve(
                [
                    source,
                    provider('primary', ['m', 'other_model']),
                    provider('up_one'),
                ],
                true,
                2,
                [
                    seed('primary', [
                        model('primary', 'm'),
                        model('primary', 'other_model'),
                    ]),
                    seed('up_one', [model('up_one', 'm')]),
                ],
            ),
        ).rejects.toThrow("name 'm' is defined by several dbt sources");
        expect(source.fetch).toHaveBeenCalledOnce();
    });

    it('ignores an ambiguous one-argument scan hint absent from the parsed manifest', async () => {
        const source = consumer([
            ref(null, 'm'),
            ref('primary', 'other_model'),
        ]);
        source.fetch.mockResolvedValue(result('consumer'));
        const resolution = await resolve(
            [
                source,
                provider('primary', ['m', 'other_model']),
                provider('up_one'),
            ],
            true,
            2,
            [
                seed('primary', [
                    model('primary', 'm'),
                    model('primary', 'other_model'),
                ]),
                seed('up_one', [model('up_one', 'm')]),
            ],
        );
        expect(resolution.results).toHaveLength(3);
        expect(source.fetch).toHaveBeenCalledOnce();
    });

    it.each(['consumer', 'installed'])(
        'keeps an actual %s binding despite multiple public providers',
        async (packageName) => {
            const source = consumer([
                ref(null, 'm'),
                ref('primary', 'other_model'),
            ]);
            source.fetch.mockImplementation(async ({ externalNodes }) => {
                const fetched = boundResult('consumer', externalNodes, [
                    ref('primary', 'other_model'),
                ]);
                const own = fetched.manifest.nodes[
                    'model.consumer.orders'
                ] as DbtRawModelNode;
                own.refs!.push({ package: null, name: 'm', version: null });
                const local = model(packageName, 'm');
                fetched.manifest.nodes[local.unique_id] = local;
                own.depends_on!.nodes!.push(local.unique_id);
                return fetched;
            });
            const resolution = await resolve(
                [
                    source,
                    provider('primary', ['m', 'other_model']),
                    provider('up_one'),
                ],
                true,
                2,
                [
                    seed('primary', [
                        model('primary', 'm'),
                        model('primary', 'other_model'),
                    ]),
                    seed('up_one', [model('up_one', 'm')]),
                ],
            );
            expect(resolution.results).toHaveLength(3);
        },
    );

    it('does not let a newly discovered disk model change a seeded one-argument binding', async () => {
        const source = consumer([ref(null, 'm')]);
        const hidden = provider('primary');
        hidden.prepare.mockResolvedValue({
            ...(await hidden.prepare()),
            localModels: [],
        });
        const resolution = await resolve(
            [source, provider('up_one'), hidden],
            true,
            2,
            [seed('primary', []), seed('up_one', [model('up_one', 'm')])],
        );
        expect(resolution.rounds).toBe(1);
        expect(source.fetch).toHaveBeenCalledOnce();
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual(
            seed('up_one', [model('up_one', 'm')]).nodes,
        );
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

it('aggregates unresolved refs after the single parse', async () => {
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
    await expect(
        resolve(
            tasks,
            true,
            2,
            tasks.map((source, index) => {
                const cached = seed(source.key);
                cached.nodes[0].depends_on_nodes = [
                    `model.${tasks[(index + 1) % tasks.length].key}.orders`,
                ];
                return cached;
            }),
        ),
    ).rejects.toThrow(
        'model.a.orders -> model.b.orders -> model.c.orders -> model.a.orders',
    );
});

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

it('never creates an unseeded version alongside a seeded versioned model', async () => {
    const consumer = withRefs('b', [
        ref('a'),
        ref('a', 'orders', '1'),
        ref('a', 'orders', '2'),
    ]);
    const nodes = [1, 2].map((version) => ({
        ...model('a'),
        unique_id: `model.a.orders.v${version}`,
        version,
        latest_version: 2,
    }));
    await resolve([consumer, scannedTask('a')], true, 2, [seed('a', nodes)]);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(
        seed('a', nodes).nodes,
    );
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
        externalNode({
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

it.each([1, 2])(
    'keeps a public version-three seed across a project ring at concurrency %i',
    async (concurrency) => {
        const alphaRefs = [ref('beta', 'measure')];
        const betaRefs = [ref('alpha', 'alpha_base')];
        const alpha = withRefs('alpha', alphaRefs, ['alpha_base', 'orders']);
        const beta = withRefs('beta', betaRefs, ['measure', 'orders']);
        alpha.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = boundResult('alpha', externalNodes, alphaRefs);
            fetched.manifest.nodes['model.alpha.alpha_base'] = model(
                'alpha',
                'alpha_base',
            );
            return fetched;
        });
        beta.fetch.mockImplementation(async ({ externalNodes }) => {
            const fetched = boundResult('beta', externalNodes, betaRefs);
            for (const version of [1, 2]) {
                const node = {
                    ...model('beta', 'measure'),
                    unique_id: `model.beta.measure.v${version}`,
                    version,
                    latest_version: 2,
                };
                fetched.manifest.nodes[node.unique_id] = node;
            }
            return fetched;
        });
        const cache = [
            seed('alpha', [
                model('alpha', 'alpha_base'),
                {
                    ...model('alpha'),
                    depends_on: { nodes: ['model.beta.measure.v3'] },
                },
            ]),
            seed(
                'beta',
                [1, 2, 3].map((version) => ({
                    ...model('beta', 'measure'),
                    unique_id: `model.beta.measure.v${version}`,
                    version,
                    latest_version: 3,
                    access: 'public',
                })),
            ),
        ];
        const resolution = await resolve(
            [alpha, beta],
            true,
            concurrency,
            cache,
        );
        expect(resolution.rounds).toBe(1);
        expect(alpha.fetch).toHaveBeenCalledOnce();
        expect(beta.fetch).toHaveBeenCalledOnce();
        expect(alpha.fetch.mock.calls[0][0].externalNodes).toEqual(
            cache[1].nodes,
        );
        expect(
            (
                resolution.results[0].result.manifest.nodes[
                    'model.alpha.orders'
                ] as DbtRawModelNode
            ).depends_on?.nodes,
        ).toEqual(['model.beta.measure.v3']);
        expect(
            (
                resolution.results[1].result.manifest.nodes[
                    'model.beta.orders'
                ] as DbtRawModelNode
            ).depends_on?.nodes,
        ).toEqual(['model.alpha.alpha_base']);
    },
);

it('warns about each unseeded upstream and still resolves sources without cross refs', async () => {
    const consumer = withRefs('consumer', [ref('alpha'), ref('beta')]);
    consumer.fetch.mockRejectedValue(
        new DbtError(
            [missing('alpha').message, missing('beta').message].join('\n'),
        ),
    );
    const alpha = scannedTask('alpha');
    const beta = scannedTask('beta');
    const onSourceResolved = vi.fn();
    const warn = vi.spyOn(Logger, 'warn');
    try {
        const resolution = resolveCrossSourceManifests({
            tasks: [consumer, alpha, beta],
            enabled: true,
            concurrency: 2,
            onSourceResolved,
        });
        await expect(resolution).rejects.toThrow("ref('alpha', 'orders')");
        await expect(resolution).rejects.toThrow("ref('beta', 'orders')");
        expect(consumer.fetch).toHaveBeenCalledOnce();
        expect(
            consumer.fetch.mock.calls[0][0].externalNodes.length,
        ).toBeGreaterThan(0);
        expect(alpha.fetch).toHaveBeenCalledOnce();
        expect(beta.fetch).toHaveBeenCalledOnce();
        expect(onSourceResolved).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls).toEqual([
            [
                expect.stringContaining(
                    'dbt.compile.crossSourceMissingSeed Cold start:',
                ),
                expect.objectContaining({
                    source: 'consumer',
                    warning: expect.stringContaining(
                        'dbt source "alpha" (project "alpha")',
                    ),
                }),
            ],
            [
                expect.stringContaining(
                    'dbt.compile.crossSourceMissingSeed Cold start:',
                ),
                expect.objectContaining({
                    source: 'consumer',
                    warning: expect.stringContaining(
                        'dbt source "beta" (project "beta")',
                    ),
                }),
            ],
        ]);
    } finally {
        warn.mockRestore();
    }
});

it.each(['comment', 'disabled model'])(
    'does not fail a successful compile for an unseeded ref scanned from a %s',
    async () => {
        const consumer = withRefs('consumer', [ref('provider')]);
        const resolution = await resolve([consumer, scannedTask('provider')]);
        expect(resolution.results).toHaveLength(2);
        expect(consumer.fetch).toHaveBeenCalledOnce();
        expect(
            consumer.fetch.mock.calls[0][0].externalNodes.length,
        ).toBeGreaterThan(0);
        expect(resolution.warnings).toEqual([
            expect.stringContaining('no confirmed last-good manifest'),
        ]);
    },
);

it('detects a cycle through a seeded version that is missing from the disk manifest', async () => {
    const refs = [ref('provider', 'measure')];
    const consumer = withRefs('consumer', refs);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, refs),
    );
    const provider = withRefs('provider', [], ['measure']);
    const cached = seed('provider', [
        {
            ...model('provider', 'measure'),
            unique_id: 'model.provider.measure.v3',
            version: 3,
            latest_version: 3,
        },
    ]);
    cached.nodes[0].depends_on_nodes = ['model.consumer.orders'];
    await expect(
        resolve([consumer, provider], true, 2, [cached, seed('consumer')]),
    ).rejects.toThrow(
        'model.consumer.orders -> model.provider.measure.v3 -> model.consumer.orders',
    );
});

it.each(['direct', 'ancestor'])(
    'rejects duplicate seeded package-model providers used as a %s',
    async (kind) => {
        const consumer = withRefs('consumer', [
            ref(kind === 'direct' ? 'shared' : 'first', 'm'),
        ]);
        const first = seed('first', [
            model('first', 'm'),
            model('shared', 'm'),
        ]);
        first.nodes[0].depends_on_nodes = ['model.shared.m'];
        const second = seed('second', [model('shared', 'm')]);
        const resolution = resolve(
            [consumer, scannedTask('first'), scannedTask('second')],
            true,
            2,
            [first, second],
        );
        await expect(resolution).rejects.toThrow(
            'External model "model.shared.m" is provided by several dbt sources: "first", "second"',
        );
        expect(consumer.fetch).not.toHaveBeenCalled();
    },
);

it('preserves a seeded ancestor link when fresh disk dependencies disagree', async () => {
    const consumer = withRefs('consumer', [ref('provider')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const provider = scannedTask('provider');
    const cache = seed('provider', [
        model('provider'),
        model('provider', 'base'),
    ]);
    cache.nodes[0].depends_on_nodes = ['model.provider.base'];
    const resolution = await resolve([consumer, provider], true, 2, [cache]);
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(cache.nodes);
});

it('freezes seed rows before callbacks publish new models and dependencies', async () => {
    const consumer = withRefs('consumer', [ref('provider')]);
    const refs = [ref('provider')];
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, refs),
    );
    const provider = scannedTask('provider');
    const cache = [seed('provider')];
    const original = structuredClone(cache[0].nodes);
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        cache,
        onSourceResolved: async ({ task: source }) => {
            if (source === provider) {
                cache[0].nodes[0].schema = 'fresh_schema';
                cache[0].nodes[0].depends_on_nodes.push(
                    'model.provider.changed',
                );
                cache[0].nodes = [];
            }
        },
    });
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(original);
});

it('keeps seeded bindings during the single parse', async () => {
    const consumer = withRefs('b', [ref('a')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('b', externalNodes, [ref('a')]),
    );
    const provider = scannedTask('a');
    const provided = result('a');
    (provided.manifest.nodes['model.a.orders'] as DbtRawModelNode).access =
        'protected';
    provider.fetch.mockResolvedValue(provided);
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        cache: [seed('a')],
    });
    expect(consumer.fetch).toHaveBeenCalledOnce();
});

it.each(['scanned', 'declared', 'cached'])(
    'injects the whole public provider surface for a %s consumer on a warm run',
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
            externalNode({
                packageName: 'provider',
                name,
                version: null,
                latestVersion: null,
            }),
        );
        const onSourceResolved = vi.fn();
        consumer.fetch.mockImplementation(async ({ externalNodes }) => {
            if (externalNodes.length === 0) return result('consumer');
            return boundResult('consumer', externalNodes, [ref('provider')]);
        });
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
                        externalNode({
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
        expect(resolution.rounds).toBe(1);
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

it('does not discover a hidden provider from parse errors on a warm run', async () => {
    const consumer = withRefs('consumer', []);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const onSourceResolved = vi.fn();
    await expect(
        resolveCrossSourceManifests({
            tasks: [consumer, scannedTask('provider')],
            enabled: true,
            concurrency: 2,
            cache: [seed('provider')],
            onSourceResolved,
        }),
    ).rejects.toThrow('Declare the upstream project');
    expect(consumer.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    expect(onSourceResolved).not.toHaveBeenCalledWith(
        expect.objectContaining({ task: consumer }),
    );
});

it('fails a hidden ref without a seed even after its provider compiles from disk', async () => {
    const consumer = withRefs('consumer', []);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const provider = scannedTask('provider');
    const onSourceResolved = vi.fn();
    const warn = vi.spyOn(Logger, 'warn');
    try {
        await expect(
            resolveCrossSourceManifests({
                tasks: [consumer, provider],
                enabled: true,
                concurrency: 2,
                onSourceResolved,
            }),
        ).rejects.toThrow('Declare the upstream project');
        expect(provider.fetch).toHaveBeenCalledOnce();
        expect(consumer.fetch).toHaveBeenCalledOnce();
        expect(onSourceResolved).toHaveBeenCalledWith(
            expect.objectContaining({ task: provider }),
        );
        expect(warn).not.toHaveBeenCalled();
    } finally {
        warn.mockRestore();
    }
});

it('injects the whole public surface of the selected one-argument provider', async () => {
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
        externalNode({
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
                    externalNode({
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
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([
        ...nodes,
        externalNode({
            packageName: 'provider',
            name: 'extra',
            version: null,
            latestVersion: null,
        }),
    ]);
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
    const resolution = await resolve([consumer, provider], true, 2, [
        seed('p', [model('p', 'm'), model('x', 'm')]),
    ]);
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch).toHaveBeenCalledTimes(1);
});

it.each(['deleted', 'private'])(
    'retains a snapshot binding when the fresh provider model is %s',
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
        const resolution = await resolve([consumer, provider], true, 2, [
            seed('p', [model('p', 'm')]),
        ]);
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
    await expect(
        resolve([a, b], true, 2, [
            {
                ...seed('a', [model('a', 'm')]),
                nodes: [
                    {
                        ...seed('a', [model('a', 'm')]).nodes[0],
                        depends_on_nodes: ['model.b.m'],
                    },
                ],
            },
            seed('b', [model('b', 'm')]),
        ]),
    ).rejects.toThrow('model.a.m -> model.b.m -> snapshot.b.s -> model.a.m');
});

it('does not retry independent seeded refs when one fresh access changes', async () => {
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
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, p, q],
        enabled: true,
        concurrency: 2,
        cache: [
            seed('p', [model('p', 'm')]),
            seed('q', [model('q', 'stable')]),
        ],
    });
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch).toHaveBeenCalledOnce();
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

it('keeps both seeded explicit versions when fresh access differs', async () => {
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
        externalNode({
            packageName: 'p',
            name: 'm',
            version: String(version),
            latestVersion: '2',
        }),
    );
    const resolution = await resolveCrossSourceManifests({
        tasks: [consumer, provider],
        enabled: true,
        concurrency: 2,
        cache: [{ key: 'p', projectName: 'p', nodes, referencedProjects: [] }],
    });
    expect(resolution.rounds).toBe(1);
    expect(consumer.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(nodes);
});

describe('source final callback', () => {
    it('finalizes seeded providers and consumers after their only pass', async () => {
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
                        externalNode({
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
        expect(resolution.rounds).toBe(1);
        expect(rounds).toEqual([['consumer', 'provider']]);
        expect(final.mock.calls).toEqual([
            ['consumer', 1, 1],
            ['provider', 1, 1],
        ]);
    });

    it('finalises a cold dependency chain after each source parses once in order', async () => {
        const order: string[] = [];
        const sources = [
            withRefs('consumer', [ref('provider')]),
            withRefs('provider', [ref('root')]),
            withRefs('root', []),
        ];
        for (const source of sources)
            source.fetch.mockImplementation(async ({ externalNodes }) => {
                order.push(source.key);
                return boundResult(
                    source.key,
                    externalNodes,
                    (await source.prepare()).refs,
                );
            });
        const final = vi.fn();
        const resolution = await resolveCrossSourceManifests({
            tasks: sources,
            enabled: true,
            concurrency: 3,
            onSourceFinal: final,
        });
        expect(order).toEqual(['root', 'provider', 'consumer']);
        expect(resolution.attempts).toBe(3);
        expect(resolution.rounds).toBe(1);
        expect(final.mock.calls.map(([source]) => source.key)).toEqual([
            'root',
            'provider',
            'consumer',
        ]);
        for (const source of sources)
            expect(source.fetch).toHaveBeenCalledOnce();
    });

    it('does not finalise a refresh that fails after its only parse', async () => {
        const final = vi.fn();
        const leaf = task(
            'leaf_a',
            vi
                .fn()
                .mockRejectedValueOnce(missing('leaf_b'))
                .mockResolvedValue(result('leaf_a')),
        );
        await expect(
            resolveCrossSourceManifests({
                tasks: [leaf, task('leaf_b')],
                enabled: true,
                concurrency: 1,
                onSourceFinal: final,
                cache: [seed('leaf_b')],
            }),
        ).rejects.toThrow('leaf_b');
        expect(leaf.fetch).toHaveBeenCalledOnce();
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

it.each(['scanned', 'declared'])(
    'includes all public nodes and their injected dependencies for %s providers',
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
        if (origin === 'declared')
            consumer.prepare.mockResolvedValue({
                ...(await consumer.prepare()),
                refs: [],
                declaredUpstreams: ['p'],
            });
        await resolveCrossSourceManifests({
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
                            ...externalNode({
                                packageName: 'p',
                                name: 'orders',
                                version: null,
                                latestVersion: null,
                            }),
                            depends_on_nodes: ['model.p.base'],
                        },
                        ...seed('p', [
                            model('p', 'base'),
                            model('p', 'unrelated'),
                        ]).nodes,
                    ],
                },
            ],
        });
        const injected = consumer.fetch.mock.calls.at(-1)![0].externalNodes;
        expect(injected.map((node) => node.name)).toEqual([
            'orders',
            'base',
            'unrelated',
        ]);
        expect(injected[0].depends_on_nodes).toEqual(['model.p.base']);
        expect(
            (provided.manifest.nodes['model.p.orders'] as DbtRawModelNode)
                .depends_on?.nodes,
        ).toEqual(['model.p.base']);
    },
);

it.each([
    'private',
    'protected',
    'public',
    null,
    undefined,
    'missing',
] as const)(
    'injects a stored model with access %s only when explicitly public',
    async (access) => {
        const refs = [ref('p')];
        const consumer = withRefs('consumer', refs, ['uses']);
        consumer.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult('consumer', externalNodes, refs),
        );
        const cached = seed('p');
        if (access === 'missing')
            Reflect.deleteProperty(cached.nodes[0], 'access');
        else if (access === undefined)
            Reflect.set(cached.nodes[0], 'access', undefined);
        else cached.nodes[0].access = access;
        const resolution = resolve([consumer, scannedTask('p')], true, 2, [
            cached,
        ]);
        if (access === 'public') {
            expect((await resolution).rounds).toBe(1);
            expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(
                cached.nodes,
            );
        } else {
            await expect(resolution).rejects.toThrow('access: public');
            for (const [options] of consumer.fetch.mock.calls)
                expect(options.externalNodes).toEqual([]);
        }
    },
);

it('traverses only public dependencies and preserves the complete stored projection', async () => {
    const consumer = withRefs('consumer', [ref('p')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('p')]),
    );
    const cached = seed('p', [
        model('p'),
        model('p', 'public_base'),
        model('p', 'protected_base'),
        model('p', 'private_base'),
        model('p', 'default_base'),
        model('p', 'missing_access_base'),
        model('p', 'hidden_public_ancestor'),
        model('p', 'unused_public'),
    ]);
    cached.nodes[0].depends_on_nodes = [
        'model.p.public_base',
        'model.p.protected_base',
        'model.p.private_base',
        'model.p.default_base',
        'model.p.missing_access_base',
        'model.p.unknown',
    ];
    cached.nodes[1].depends_on_nodes = ['model.p.private_base'];
    cached.nodes[2].access = 'protected';
    cached.nodes[2].depends_on_nodes = ['model.p.hidden_public_ancestor'];
    cached.nodes[3].access = 'private';
    cached.nodes[4].access = null;
    Reflect.deleteProperty(cached.nodes[5], 'access');
    const original = structuredClone(cached);
    await resolve([consumer, scannedTask('p')], true, 2, [cached]);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([
        { ...cached.nodes[0], depends_on_nodes: ['model.p.public_base'] },
        { ...cached.nodes[1], depends_on_nodes: [] },
        cached.nodes[6],
        cached.nodes[7],
    ]);
    expect(cached).toEqual(original);
});

it('ignores non-public providers when resolving a one-argument public ref', async () => {
    const consumer = withRefs('consumer', [ref(null)], ['uses']);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref(null)]),
    );
    const hidden = seed('hidden');
    hidden.nodes[0].access = 'protected';
    const visible = seed('visible');
    await resolve(
        [consumer, scannedTask('hidden'), scannedTask('visible')],
        true,
        2,
        [hidden, visible],
    );
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(
        visible.nodes,
    );
});

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
                externalNode({
                    packageName: key,
                    name: 'orders',
                    version: String(index + 1),
                    latestVersion: String(index + 1),
                }),
            ],
        })),
    });
    expect(resolution.rounds).toBe(1);
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

describe('source failure isolation', () => {
    const isolate = (
        tasks: CrossSourceFetchTask<string>[],
        enabled = true,
        cache: CrossSourceCatalog[] = [],
    ) => {
        const onSourceFailure = vi.fn(
            async (source: CrossSourceFetchTask<string>) =>
                source.key !== 'primary',
        );
        return {
            onSourceFailure,
            resolution: resolveCrossSourceManifests({
                tasks,
                enabled,
                concurrency: 2,
                onSourceFailure,
                cache,
            }),
        };
    };

    it.each([true, false])(
        'keeps healthy manifests after a sibling fetch failure (refs=%s)',
        async (enabled) => {
            const primary = task('primary');
            const broken = task('broken');
            broken.fetch.mockRejectedValue(new Error('parse failed'));
            const healthy = task('healthy');
            const { resolution, onSourceFailure } = isolate(
                [primary, broken, healthy],
                enabled,
            );
            expect(
                (await resolution).results.map((entry) => entry.task.key),
            ).toEqual(['primary', 'healthy']);
            expect(onSourceFailure).toHaveBeenCalledWith(
                broken,
                expect.any(Error),
                'manifest',
            );
        },
    );

    it('keeps healthy manifests after a sibling preparation failure', async () => {
        const primary = scannedTask('primary');
        const broken = scannedTask('broken');
        broken.prepare.mockRejectedValue(new Error('clone failed'));
        const { resolution } = isolate([primary, broken]);
        expect(
            (await resolution).results.map((entry) => entry.task.key),
        ).toEqual(['primary']);
        expect(broken.fetch).not.toHaveBeenCalled();
    });

    it('keeps primary failures fatal', async () => {
        const primary = task('primary');
        primary.fetch.mockRejectedValue(new Error('primary failed'));
        await expect(
            isolate([primary, task('healthy')]).resolution,
        ).rejects.toThrow('primary failed');
    });

    it('drops consumers of a failed provider even when cached stubs let dbt parse', async () => {
        const primary = scannedTask('primary');
        const provider = scannedTask('provider');
        provider.fetch.mockRejectedValue(new Error('parse failed'));
        const consumer = scannedTask('consumer', ['provider']);
        const consumerManifest = manifest('consumer');
        const node = consumerManifest.nodes[
            'model.consumer.orders'
        ] as DbtRawModelNode;
        node.depends_on = { nodes: ['model.provider.orders'], macros: [] };
        consumer.fetch.mockResolvedValue({
            ...result('consumer'),
            manifest: consumerManifest,
        });
        const { resolution, onSourceFailure } = isolate(
            [primary, provider, consumer],
            true,
            [seed('provider')],
        );
        expect(
            (await resolution).results.map((entry) => entry.task.key),
        ).toEqual(['primary']);
        expect(onSourceFailure).toHaveBeenCalledWith(
            consumer,
            expect.objectContaining({ name: 'DbtSourceDependencyError' }),
            'dependency',
        );
    });

    it('keeps ambiguity errors fatal when source isolation is enabled', async () => {
        const consumer = scannedTask('consumer');
        consumer.prepare.mockResolvedValue({
            ...(await consumer.prepare()),
            localModels: [],
            refs: [{ packageName: null, name: 'orders', version: null }],
        });
        consumer.fetch.mockRejectedValue(
            new DbtError(
                "depends on a node named 'orders' which was not found",
            ),
        );
        const { resolution, onSourceFailure } = isolate([
            task('primary'),
            consumer,
            scannedTask('first'),
            scannedTask('second'),
        ]);
        await expect(resolution).rejects.toThrow(
            'defined by several dbt sources',
        );
        expect(onSourceFailure).not.toHaveBeenCalled();
    });

    it('keeps cycles fatal when source isolation is enabled', async () => {
        const first = scannedTask('first', ['second']);
        const second = scannedTask('second', ['first']);
        for (const [source, provider] of [
            [first, 'second'],
            [second, 'first'],
        ] as const) {
            const fetched = result(source.key);
            (
                fetched.manifest.nodes[
                    `model.${source.key}.orders`
                ] as DbtRawModelNode
            ).depends_on = { nodes: [`model.${provider}.orders`], macros: [] };
            source.fetch.mockResolvedValue(fetched);
        }
        const { resolution, onSourceFailure } = isolate(
            [task('primary'), first, second],
            true,
            ['first', 'second'].map((key, index, keys) => ({
                ...seed(key),
                nodes: [
                    {
                        ...seed(key).nodes[0],
                        depends_on_nodes: [`model.${keys[1 - index]}.orders`],
                    },
                ],
            })),
        );
        await expect(resolution).rejects.toThrow('cycle across dbt sources');
        expect(onSourceFailure).not.toHaveBeenCalled();
    });

    it('does not swallow cancellation', async () => {
        const controller = new AbortController();
        const broken = task('broken');
        broken.fetch.mockImplementation(async () => {
            controller.abort(new Error('job cancelled'));
            throw new Error('parse interrupted');
        });
        const onSourceFailure = vi.fn(async () => true);
        await expect(
            resolveCrossSourceManifests({
                tasks: [broken],
                enabled: true,
                concurrency: 1,
                signal: controller.signal,
                onSourceFailure,
            }),
        ).rejects.toThrow('job cancelled');
        expect(onSourceFailure).not.toHaveBeenCalled();
    });
});

it('does not replace an empty confirmed snapshot with a fresh disk catalogue', async () => {
    const consumer = withRefs('consumer', [ref('provider')]);
    consumer.fetch.mockImplementation(async ({ externalNodes }) =>
        boundResult('consumer', externalNodes, [ref('provider')]),
    );
    const provider = scannedTask('provider');
    await expect(
        resolve([provider, consumer], true, 1, [
            { ...seed('provider'), nodes: [] },
        ]),
    ).rejects.toThrow(
        'confirmed last-good manifest of dbt source "provider" does not define',
    );
    expect(provider.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch).toHaveBeenCalledOnce();
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([]);
});

it('fails a cold ring after one parse per source without creating substitute nodes', async () => {
    const first = withRefs('first', [ref('second')]);
    const second = withRefs('second', [ref('first')]);
    for (const source of [first, second])
        source.fetch.mockImplementation(async ({ externalNodes }) =>
            boundResult(
                source.key,
                externalNodes,
                (await source.prepare()).refs,
            ),
        );
    await expect(resolve([first, second])).rejects.toThrow(
        'no confirmed last-good manifest',
    );
    for (const source of [first, second]) {
        expect(source.fetch).toHaveBeenCalledOnce();
        expect(source.fetch.mock.calls[0][0].externalNodes).toEqual([]);
    }
});

it('filters dependencies to the exact injected surface even when other public catalogues contain the IDs', async () => {
    const consumer = withRefs('consumer', [ref('provider')]);
    const cache = [
        seed('provider', [model('provider'), model('provider', 'base')]),
        seed('unreferenced'),
        seed('consumer'),
    ];
    cache[0].nodes[0].depends_on_nodes = [
        'model.provider.base',
        'model.consumer.orders',
        'model.unreferenced.orders',
        'model.unknown.orders',
    ];
    const original = structuredClone(cache);
    await resolve(
        [consumer, scannedTask('provider'), scannedTask('unreferenced')],
        true,
        3,
        cache,
    );
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual([
        { ...cache[0].nodes[0], depends_on_nodes: ['model.provider.base'] },
        cache[0].nodes[1],
    ]);
    expect(cache).toEqual(original);
});

it('injects explicit public seeds and snapshots with their native IDs', async () => {
    const consumer = withRefs('consumer', [ref('provider')]);
    const cached = seed('provider');
    cached.nodes.push(
        { ...cached.nodes[0], name: 'lookup', resource_type: 'seed' },
        {
            ...cached.nodes[0],
            name: 'history',
            resource_type: 'snapshot',
            depends_on_nodes: ['seed.provider.lookup'],
        },
    );
    cached.nodes[0].depends_on_nodes = ['snapshot.provider.history'];
    await resolve([consumer, scannedTask('provider')], true, 2, [cached]);
    expect(consumer.fetch.mock.calls[0][0].externalNodes).toEqual(cached.nodes);
});

it('rejects duplicate foreign public IDs between two scan-less sources', async () => {
    const first = task('first');
    const second = task('second');
    const firstSeed = seed('first', [model('first'), model('shared', 'm')]);
    firstSeed.referencedProjects = ['second'];
    const secondSeed = seed('second', [model('second'), model('shared', 'm')]);
    await expect(
        resolve([first, second], true, 2, [firstSeed, secondSeed]),
    ).rejects.toThrow(
        'External model "model.shared.m" is provided by several dbt sources: "first", "second"',
    );
    expect(first.fetch).not.toHaveBeenCalled();
});

it('preserves dbt error log details when no missing-node reference can decorate the failure', async () => {
    const consumer = task('consumer');
    consumer.fetch.mockRejectedValue(
        new DbtError('Failed to run dbt ls', [
            {
                code: 'CompilationError',
                info: {
                    category: 'dbt',
                    code: 'CompilationError',
                    extra: {},
                    invocation_id: 'test',
                    level: 'error',
                    log_version: 2,
                    msg: 'Ambiguous reference: m is available from multiple packages',
                    name: 'CompilationError',
                    pid: 1,
                    thread_name: 'main',
                    ts: '',
                    type: 'log_line',
                },
            },
        ]),
    );
    await expect(resolve([consumer])).rejects.toThrow(
        'Ambiguous reference: m is available from multiple packages',
    );
    expect(consumer.fetch).toHaveBeenCalledOnce();
});
