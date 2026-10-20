import {
    DbtError,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
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

describe('resolveCrossSourceManifests', () => {
    it('fetches independent sources once and preserves their order and manifests', async () => {
        const a = task('a');
        const b = task('b');
        const resolution = await resolve([a, b]);
        expect(resolution.rounds).toBe(1);
        expect(
            resolution.results.map(
                ({ task: resolvedTask }) => resolvedTask.context,
            ),
        ).toEqual(['a', 'b']);
        expect(
            resolution.results.map(({ result: fetched }) => fetched.manifest),
        ).toEqual([manifest('a'), manifest('b')]);
        expect(a.fetch).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
            signal: expect.any(AbortSignal),
        });
        expect(b.fetch).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
            signal: expect.any(AbortSignal),
        });
    });
    it('retries a dependent source with real sibling models and strips its external stubs and selections', async () => {
        const a = task('a');
        const stub = { ...model('a'), path: '', original_file_path: '' };
        const bResult = result('b');
        bResult.manifest.nodes[stub.unique_id] = stub;
        const b = task(
            'b',
            vi
                .fn()
                .mockRejectedValueOnce(missing('a'))
                .mockResolvedValueOnce({
                    ...bResult,
                    selectedModelIds: ['model.a.orders', 'model.b.orders'],
                }),
        );
        const resolution = await resolve([b, a]);
        expect(resolution.rounds).toBe(2);
        expect(b.fetch.mock.calls[1][0].externalNodes).toEqual([
            expect.objectContaining({ package_name: 'a', name: 'orders' }),
        ]);
        expect(resolution.results[0].injectedFrom).toEqual(['a']);
        expect(resolution.results[0].result.manifest.nodes).toEqual(
            manifest('b').nodes,
        );
        expect(resolution.results[0].result.selectedModelIds).toEqual([
            'model.b.orders',
        ]);
        expect(a.fetch).toHaveBeenCalledTimes(1);
    });
    it('resolves a three-source chain over three rounds', async () => {
        const a = task('a');
        const b = task(
            'b',
            vi
                .fn()
                .mockRejectedValueOnce(missing('a'))
                .mockResolvedValueOnce(result('b')),
        );
        const c = task(
            'c',
            vi
                .fn()
                .mockRejectedValueOnce(missing('b'))
                .mockResolvedValueOnce(result('c')),
        );
        const resolution = await resolve([c, b, a]);
        expect(resolution.rounds).toBe(3);
        expect(
            c.fetch.mock.calls[1][0].externalNodes.map(
                (node: { package_name: string }) => node.package_name,
            ),
        ).toEqual(['a', 'b']);
        expect(resolution.results[0].injectedFrom).toEqual(['b']);
    });
    it('propagates the first rejection when disabled without waiting for in-flight or queued tasks', async () => {
        let rejectSlow!: (error: unknown) => void;
        const slowError = missing('slow');
        const firstError = missing('fast');
        const slow = task(
            'slow',
            vi.fn(
                () =>
                    new Promise<ReturnType<typeof result>>((_, reject) => {
                        rejectSlow = reject;
                    }),
            ),
        );
        const fast = task('fast', vi.fn().mockRejectedValue(firstError));
        const queued = task('queued');
        const rejected = vi.fn();
        const resolution = resolve([slow, fast, queued], false).catch(rejected);
        try {
            await vi.waitFor(() =>
                expect(rejected).toHaveBeenCalledWith(firstError),
            );
            expect(slow.fetch).toHaveBeenCalledTimes(1);
            expect(fast.fetch).toHaveBeenCalledTimes(1);
            expect(queued.fetch).not.toHaveBeenCalled();
        } finally {
            rejectSlow(slowError);
            await resolution;
        }
    });
    it('injects every version of a provider model', async () => {
        const provider = result('a');
        provider.manifest.nodes = Object.fromEntries(
            [1, 2].map((version) => {
                const node = {
                    ...model('a', 'product'),
                    unique_id: `model.a.product.v${version}`,
                    version,
                    latest_version: 2,
                };
                return [node.unique_id, node];
            }),
        );
        const consumer = task(
            'b',
            vi
                .fn()
                .mockRejectedValueOnce(missing('a', 'product'))
                .mockResolvedValueOnce(result('b')),
        );
        await resolve([
            task('a', vi.fn().mockResolvedValue(provider)),
            consumer,
        ]);
        expect(consumer.fetch.mock.calls[1][0].externalNodes).toEqual([
            expect.objectContaining({
                package_name: 'a',
                name: 'product',
                version: 1,
            }),
            expect.objectContaining({
                package_name: 'a',
                name: 'product',
                version: 2,
            }),
        ]);
    });
    it.each([
        { projectName: undefined, packageName: 'root', modelName: 'orders' },
        { projectName: 'root', packageName: 'installed', modelName: 'first' },
    ])(
        'resolves refs to $packageName and records the provider with metadata project $projectName',
        async ({ projectName, packageName, modelName }) => {
            const provider = result('root');
            provider.manifest.metadata.project_name = projectName;
            for (const name of ['first', 'second']) {
                const node = model('installed', name);
                provider.manifest.nodes[node.unique_id] = node;
            }
            const consumer = task(
                'consumer',
                vi
                    .fn()
                    .mockRejectedValueOnce(missing(packageName, modelName))
                    .mockResolvedValueOnce(result('consumer')),
            );
            const resolution = await resolve([
                task('provider', vi.fn().mockResolvedValue(provider)),
                consumer,
            ]);
            expect(consumer.fetch.mock.calls[1][0].externalNodes).toEqual([
                expect.objectContaining({
                    package_name: 'root',
                    name: 'orders',
                }),
                expect.objectContaining({
                    package_name: 'installed',
                    name: 'first',
                }),
                expect.objectContaining({
                    package_name: 'installed',
                    name: 'second',
                }),
            ]);
            expect(resolution.results[1].injectedFrom).toEqual(['provider']);
            expect(resolution.rounds).toBe(2);
        },
    );
    it('names the source, ref and project when no provider exists', async () => {
        await expect(
            resolve([
                task('a'),
                task('b', vi.fn().mockRejectedValue(missing('unknown'))),
            ]),
        ).rejects.toThrow(
            'Cannot resolve dbt source "b": ref "unknown.orders" was not found. No connected dbt source provides project "unknown".',
        );
    });
    it('lists missing providers for each of two pending sources', async () => {
        await expect(
            resolve([
                task('a', vi.fn().mockRejectedValue(missing('unknown'))),
                task(
                    'b',
                    vi.fn().mockRejectedValue(missing('nowhere', 'ghost')),
                ),
            ]),
        ).rejects.toHaveProperty(
            'message',
            'Cannot resolve cross-source dbt refs: Source "a": unknown.orders: No connected dbt source provides project "unknown"; Source "b": nowhere.ghost: No connected dbt source provides project "nowhere"',
        );
    });
    it('classifies each ref when a source has missing and pending providers', async () => {
        const error = new DbtError(
            [missing('a', 'absent'), missing('unknown'), missing('c')]
                .map((failure) => failure.message)
                .join('\n'),
        );
        await expect(
            resolve([
                task('a'),
                task('b', vi.fn().mockRejectedValue(error)),
                task('c', vi.fn().mockRejectedValue(missing('b'))),
            ]),
        ).rejects.toHaveProperty(
            'message',
            'Cannot resolve cross-source dbt refs: Source "b": a.absent: source "a" provides project "a" but has no model "absent", unknown.orders: No connected dbt source provides project "unknown", c.orders: the pending sources depend on each other; Source "c": b.orders: the pending sources depend on each other',
        );
    });
    it('identifies a pending upstream source separately from its missing provider', async () => {
        await expect(
            resolve([
                task('b', vi.fn().mockRejectedValue(missing('c'))),
                task('c', vi.fn().mockRejectedValue(missing('unknown'))),
            ]),
        ).rejects.toHaveProperty(
            'message',
            'Cannot resolve cross-source dbt refs: Source "b": c.orders: waiting for dbt source "c", which failed: Model \'model.analytics.orders\' depends on a node named \'orders\' in package or project \'unknown\' which was not found; Source "c": unknown.orders: No connected dbt source provides project "unknown"',
        );
    });
    it('lists pending sources and refs when they form a cycle', async () => {
        await expect(
            resolve([
                task('b', vi.fn().mockRejectedValue(missing('c'))),
                task('c', vi.fn().mockRejectedValue(missing('b'))),
            ]),
        ).rejects.toThrow(
            'Cannot resolve cross-source dbt refs: the pending sources depend on each other. Source "b": c.orders; Source "c": b.orders',
        );
    });
    it('rethrows unrelated retry errors', async () => {
        const error = new Error('invalid SQL');
        const b = task(
            'b',
            vi
                .fn()
                .mockRejectedValueOnce(missing('a'))
                .mockRejectedValueOnce(error),
        );
        await expect(resolve([task('a'), b])).rejects.toBe(error);
    });
    it('rethrows unrelated first-round errors without retrying', async () => {
        const error = new Error('git authentication failed');
        const b = task('b', vi.fn().mockRejectedValue(error));
        const c = task('c', vi.fn().mockRejectedValue(missing('a')));
        await expect(resolve([task('a'), b, c])).rejects.toBe(error);
        expect(c.fetch).not.toHaveBeenCalled();
    });
    it('accepts newly revealed missing packages without retrying forever', async () => {
        const b = task(
            'b',
            vi
                .fn()
                .mockRejectedValueOnce(missing('a'))
                .mockRejectedValueOnce(missing('unknown')),
        );
        await expect(resolve([task('a'), b])).rejects.toThrow(
            'No connected dbt source provides project "unknown".',
        );
        expect(b.fetch).toHaveBeenCalledTimes(2);
    });
    it('stops when an injected project still cannot resolve a model', async () => {
        const b = task('b', vi.fn().mockRejectedValue(missing('a', 'absent')));
        await expect(resolve([task('a'), b])).rejects.toThrow(
            'Cannot resolve cross-source dbt refs: Source "b": a.absent: source "a" provides project "a" but has no model "absent"',
        );
        expect(b.fetch).toHaveBeenCalledTimes(2);
    });
    it('runs the initial fetch within the requested concurrency', async () => {
        let active = 0;
        let maximum = 0;
        const tasks = ['a', 'b', 'c'].map((name) =>
            task(
                name,
                vi.fn(async () => {
                    active += 1;
                    maximum = Math.max(maximum, active);
                    await new Promise<void>((done) => {
                        setTimeout(done, 1);
                    });
                    active -= 1;
                    return result(name);
                }),
            ),
        );
        await resolve(tasks, true, 1);
        expect(maximum).toBe(1);
    });
});

const scannedTask = (
    key: string,
    references: string[] = [],
    declared: string[] = [],
) => ({
    ...task(key),
    prepare: vi.fn(
        async (): Promise<DbtProjectScan> => ({
            projectName: key,
            referencedProjects: references,
            installedPackages: [],
            declaredUpstreams: declared,
        }),
    ),
});

describe('ordered cross-source refs', () => {
    it('orders a reversed chain and injects only direct providers on each first attempt', async () => {
        const a = scannedTask('a');
        const b = scannedTask('b', ['a']);
        const c = scannedTask('c', ['b']);
        const resolution = await resolve([c, b, a]);
        expect(resolution.attempts).toBe(3);
        expect(resolution.firstAttemptInjected).toBe(2);
        expect(resolution.scan).toEqual({ known: 2, ordered: 2 });
        for (const entry of [a, b, c])
            expect(entry.fetch).toHaveBeenCalledTimes(1);
        expect(a.fetch.mock.calls[0][0].externalNodes).toEqual([]);
        expect(
            b.fetch.mock.calls[0][0].externalNodes.map(
                (node) => node.package_name,
            ),
        ).toEqual(['a']);
        expect(
            c.fetch.mock.calls[0][0].externalNodes.map(
                (node) => node.package_name,
            ),
        ).toEqual(['b']);
    });
    it('orders a diamond without failed attempts', async () => {
        const a = scannedTask('a');
        const b = scannedTask('b', ['a']);
        const c = scannedTask('c', ['a']);
        const d = scannedTask('d', ['b', 'c']);
        const resolution = await resolve([d, c, b, a]);
        expect(resolution.attempts).toBe(4);
        for (const entry of [a, b, c, d])
            expect(entry.fetch).toHaveBeenCalledTimes(1);
        expect(
            d.fetch.mock.calls[0][0].externalNodes.map(
                (node) => node.package_name,
            ),
        ).toEqual(['b', 'c']);
    });
    it('starts a ready dependent while an unrelated source is still running', async () => {
        let release!: () => void;
        const slow = task(
            'slow',
            vi.fn(async () => {
                await new Promise<void>((done) => {
                    release = done;
                });
                return result('slow');
            }),
        );
        const a = scannedTask('a');
        const b = scannedTask('b', ['a']);
        const promise = resolve([slow, b, a]);
        try {
            await vi.waitFor(() => expect(b.fetch).toHaveBeenCalledTimes(1));
        } finally {
            release();
            await promise;
        }
    });
    it('accepts a false positive hint and ignores unknown hints', async () => {
        const b = scannedTask('b', ['a', 'ghost']);
        await resolve([b, scannedTask('a')]);
        expect(b.fetch).toHaveBeenCalledTimes(1);
        expect(b.fetch.mock.calls[0][0].externalNodes).toHaveLength(1);
    });
    it('uses the retry loop for a dynamic ref missed by the scan', async () => {
        const b = scannedTask('b');
        b.fetch.mockRejectedValueOnce(missing('a'));
        const resolution = await resolve([b, scannedTask('a')]);
        expect(resolution.attempts).toBe(3);
        expect(b.fetch).toHaveBeenCalledTimes(2);
    });
    it('releases a Jinja comment scan hint when its provider dynamically refs the consumer', async () => {
        const a = scannedTask('a', ['b']);
        const b = scannedTask('b');
        b.fetch.mockRejectedValueOnce(missing('a'));
        const resolution = await resolve([a, b]);
        expect(resolution.attempts).toBe(3);
        expect(a.fetch).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
            signal: expect.any(AbortSignal),
        });
        expect(b.fetch).toHaveBeenCalledTimes(2);
        expect(b.fetch.mock.calls[1][0].externalNodes).toEqual([
            expect.objectContaining({ package_name: 'a' }),
        ]);
    });
    it('releases blocked scan hints after a retry round makes no progress', async () => {
        const a = scannedTask('a', ['b']);
        const b = scannedTask('b');
        b.fetch.mockRejectedValueOnce(missing('a'));
        const stuck = scannedTask('stuck');
        stuck.fetch.mockRejectedValue(missing('c', 'absent'));
        await expect(resolve([a, b, stuck, scannedTask('c')])).rejects.toThrow(
            'source "c" provides project "c" but has no model "absent"',
        );
        expect(a.fetch).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
            signal: expect.any(AbortSignal),
        });
        expect(b.fetch).toHaveBeenCalledTimes(2);
    });
    it('injects only direct providers on a first attempt unblocked by a retry', async () => {
        const a = scannedTask('a', ['b']);
        const b = scannedTask('b');
        b.fetch.mockRejectedValueOnce(missing('c'));
        const resolution = await resolve([
            a,
            b,
            scannedTask('c'),
            scannedTask('u'),
        ]);
        expect(resolution.attempts).toBe(5);
        expect(a.fetch).toHaveBeenCalledExactlyOnceWith({
            signal: expect.any(AbortSignal),
            externalNodes: [expect.objectContaining({ package_name: 'b' })],
        });
        expect(resolution.results[0].injectedFrom).toEqual(['b']);
    });
    it('rejects a declared cycle before any fetch', async () => {
        const a = scannedTask('a', [], ['b']);
        const b = scannedTask('b', [], ['a']);
        await expect(resolve([a, b])).rejects.toHaveProperty(
            'message',
            'Declared dbt upstreams form a cycle: "a" -> "b" -> "a". Fix dependencies.yml in one of the repositories.',
        );
        expect(a.fetch).not.toHaveBeenCalled();
        expect(b.fetch).not.toHaveBeenCalled();
    });
    it('drops scan cycle edges and falls back to retries', async () => {
        const a = scannedTask('a', ['b']);
        const b = scannedTask('b', ['a']);
        b.fetch.mockRejectedValueOnce(missing('a'));
        const resolution = await resolve([a, b]);
        expect(resolution.attempts).toBe(3);
        expect(resolution.scan.ordered).toBe(0);
    });
    it('keeps declared ordering when a reverse scan hint forms a cycle', async () => {
        const a = scannedTask('a', ['b']);
        const b = scannedTask('b', [], ['a']);
        const resolution = await resolve([b, a]);
        expect(resolution.scan).toEqual({ known: 2, ordered: 1 });
        expect(resolution.attempts).toBe(2);
        expect(a.fetch.mock.calls[0][0].externalNodes).toEqual([]);
        expect(b.fetch.mock.calls[0][0].externalNodes).toEqual([
            expect.objectContaining({ package_name: 'a' }),
        ]);
    });
    it('rejects an unknown declared upstream before dbt ls', async () => {
        const a = scannedTask('a', [], ['p']);
        await expect(resolve([a])).rejects.toHaveProperty(
            'message',
            'dbt source "a" declares upstream project "p" in dependencies.yml, but no connected dbt source provides project "p".',
        );
        expect(a.fetch).not.toHaveBeenCalled();
    });
    it.each(['metadata', 'package'])(
        'resolves a declared upstream from a scan-less provider manifest %s',
        async (providedBy) => {
            const consumer = scannedTask('consumer', [], ['upstream']);
            const providerResult = result('root');
            if (providedBy === 'metadata') {
                providerResult.manifest.metadata.project_name = 'upstream';
            } else {
                const upstream = model('upstream');
                providerResult.manifest.nodes[upstream.unique_id] = upstream;
            }
            const provider = {
                ...task('provider', vi.fn().mockResolvedValue(providerResult)),
                prepare: vi.fn().mockResolvedValue(null),
            };
            const resolution = await resolve([consumer, provider]);
            expect(resolution.attempts).toBe(2);
            expect(provider.fetch).toHaveBeenCalledExactlyOnceWith({
                externalNodes: [],
                signal: expect.any(AbortSignal),
            });
            expect(consumer.fetch).toHaveBeenCalledExactlyOnceWith({
                signal: expect.any(AbortSignal),
                externalNodes: expect.arrayContaining([
                    expect.objectContaining({ package_name: 'root' }),
                ]),
            });
            expect(resolution.results[0].injectedFrom).toEqual(['provider']);
        },
    );
    it('rejects an unknown declared upstream after fetching scan-less providers', async () => {
        const consumer = scannedTask('consumer', [], ['unknown']);
        const provider = task('provider');
        await expect(resolve([consumer, provider])).rejects.toHaveProperty(
            'message',
            'dbt source "consumer" declares upstream project "unknown" in dependencies.yml, but no connected dbt source provides project "unknown".',
        );
        expect(provider.fetch).toHaveBeenCalledTimes(1);
        expect(consumer.fetch).not.toHaveBeenCalled();
    });
    it.each([true, false])(
        'compiles disjoint same-named sources with a comment-only own-project hint: %s',
        async (referencesOwnProject) => {
            const sources = ['a', 'b'].map((key) => {
                const source = scannedTask(key);
                source.prepare.mockResolvedValue({
                    projectName: 'p',
                    referencedProjects: [],
                    installedPackages: [],
                    declaredUpstreams: [],
                    referencesOwnProject,
                });
                const fetched = result('p');
                const node = {
                    ...model('p', key),
                    raw_code: "{# {{ ref('p', 'comment_only') }} #} select 1",
                };
                fetched.manifest.nodes = { [node.unique_id]: node };
                source.fetch.mockResolvedValue(fetched);
                return source;
            });
            await expect(resolve(sources)).rejects.toThrow(
                'both use the dbt project name "p"',
            );
            sources.forEach((source) =>
                expect(source.fetch).not.toHaveBeenCalled(),
            );
        },
    );
    it.each([false, true])(
        'rejects an actual missing ref to a shared project name on a retry: %s',
        async (onRetry) => {
            const a = scannedTask('a');
            const b = scannedTask('b');
            for (const source of [a, b]) {
                source.prepare.mockResolvedValue({
                    projectName: 'p',
                    referencedProjects: [],
                    installedPackages: [],
                    declaredUpstreams: [],
                });
            }
            b.fetch.mockResolvedValue(result('p'));
            if (onRetry) a.fetch.mockRejectedValueOnce(missing('upstream'));
            a.fetch.mockRejectedValue(missing('p'));
            await expect(
                resolve([a, b, scannedTask('upstream')]),
            ).rejects.toHaveProperty(
                'message',
                'dbt sources "a" and "b" both use the dbt project name "p". Each connected dbt source needs a unique name: in dbt_project.yml. Change the name in one of the repositories.',
            );
            expect(a.fetch).not.toHaveBeenCalled();
        },
    );
    it('does not blame shared project names for an unrelated missing ref', async () => {
        const sources = ['a', 'b'].map((key) => {
            const source = scannedTask(key);
            source.prepare.mockResolvedValue({
                projectName: 'p',
                referencedProjects: [],
                installedPackages: [],
                declaredUpstreams: [],
                referencesOwnProject: true,
            });
            return source;
        });
        sources[0].fetch.mockRejectedValue(missing('unknown'));
        await expect(resolve(sources)).rejects.toHaveProperty(
            'message',
            'dbt sources "a" and "b" both use the dbt project name "p". Each connected dbt source needs a unique name: in dbt_project.yml. Change the name in one of the repositories.',
        );
    });
    it('reports declared dependents without fetching them before their provider resolves', async () => {
        const a = scannedTask('provider');
        a.prepare.mockResolvedValue({
            projectName: 'upstream',
            referencedProjects: [],
            installedPackages: [],
            declaredUpstreams: [],
        });
        a.fetch.mockRejectedValue(missing('unknown'));
        const b = scannedTask('consumer', [], ['upstream']);
        await expect(resolve([b, a])).rejects.toHaveProperty(
            'message',
            'Cannot resolve cross-source dbt refs: Source "provider": unknown.orders: No connected dbt source provides project "unknown"; Source "consumer": upstream.*: waiting for dbt source "provider", which failed: Model \'model.analytics.orders\' depends on a node named \'orders\' in package or project \'unknown\' which was not found',
        );
        expect(b.fetch).not.toHaveBeenCalled();
    });
    it('keeps a dependent blocked until every declared provider resolves through retries', async () => {
        const a = scannedTask('a');
        a.fetch.mockRejectedValueOnce(missing('x'));
        const b = scannedTask('b');
        b.fetch.mockRejectedValue(missing('unknown'));
        const consumer = scannedTask('consumer', [], ['a', 'b']);
        await expect(
            resolve([consumer, a, b, scannedTask('x')]),
        ).rejects.toThrow(
            'Source "consumer": b.*: waiting for dbt source "b", which failed:',
        );
        expect(consumer.fetch).not.toHaveBeenCalled();
        expect(a.fetch).toHaveBeenCalledTimes(2);
    });
    it.each([true, false])(
        'warns only when a single-argument ref resolves externally: %s',
        async (external) => {
            const b = scannedTask('b', ['a']);
            const fetched = result('b');
            const dependency = {
                ...model('a'),
                ...(external ? { path: '', original_file_path: '' } : {}),
            };
            fetched.manifest.nodes[dependency.unique_id] = dependency;
            Object.assign(fetched.manifest.nodes['model.b.orders'], {
                refs: [{ name: 'orders', package: null, version: null }],
                depends_on: { nodes: [dependency.unique_id] },
            });
            b.fetch.mockResolvedValue(fetched);
            const resolution = await resolve([b, scannedTask('a')]);
            expect(resolution.warnings).toEqual(
                external
                    ? [
                          "Model \"orders\" in dbt source \"b\" uses ref('orders'), which resolved to external model model.a.orders from another dbt source. Use ref('a', 'orders') to make the cross-source reference explicit.",
                      ]
                    : [],
            );
        },
    );
    it.each([
        { versions: [1, 2], requested: [1, 2], expected: [1, 2] },
        { versions: [1, 2], requested: [null], expected: [2] },
        { versions: [1], requested: [null], expected: [1] },
    ])(
        'warns for external versions $expected requested as $requested',
        async ({ versions, requested, expected }) => {
            const consumer = scannedTask('b', ['a']);
            const fetched = result('b');
            const dependencies = versions.map((version) => ({
                ...model('a'),
                unique_id: `model.a.orders.v${version}`,
                version,
                latest_version: 2,
                path: '',
                original_file_path: '',
            }));
            dependencies.forEach((dependency) => {
                fetched.manifest.nodes[dependency.unique_id] = dependency;
            });
            Object.assign(fetched.manifest.nodes['model.b.orders'], {
                refs: requested.map((version) => ({
                    name: 'orders',
                    package: null,
                    version,
                })),
                depends_on: {
                    nodes: dependencies.map(({ unique_id }) => unique_id),
                },
            });
            consumer.fetch.mockResolvedValue(fetched);
            const resolution = await resolve([consumer, scannedTask('a')]);
            expect(resolution.warnings).toEqual(
                expected.map((version, index) => {
                    const versionArg =
                        requested[index] === null ? '' : `, v=${version}`;
                    return `Model "orders" in dbt source "b" uses ref('orders'${versionArg}), which resolved to external model model.a.orders.v${version} from another dbt source. Use ref('a', 'orders'${versionArg}) to make the cross-source reference explicit.`;
                }),
            );
        },
    );
    it('does not warn for a local single-argument ref beside a qualified external ref with the same name', async () => {
        const consumer = scannedTask('consumer', ['upstream']);
        const fetched = result('consumer');
        const local = model('consumer');
        const stub = {
            ...model('upstream'),
            path: '',
            original_file_path: '',
        };
        const mixed = {
            ...model('consumer', 'mixed'),
            refs: [
                { name: 'orders', package: null, version: null },
                { name: 'orders', package: 'upstream', version: null },
            ],
            depends_on: { nodes: [stub.unique_id, local.unique_id] },
        };
        fetched.manifest.nodes[stub.unique_id] = stub;
        fetched.manifest.nodes[mixed.unique_id] = mixed;
        consumer.fetch.mockResolvedValue(fetched);
        const resolution = await resolve([consumer, scannedTask('upstream')]);
        expect(resolution.warnings).toEqual([]);
    });
    it('does not warn for an installed-package ref resolved in the root project beside a qualified external version', async () => {
        const consumer = scannedTask('root', ['upstream']);
        const fetched = result('root');
        const local = model('root');
        const stub = {
            ...model('upstream'),
            unique_id: 'model.upstream.orders.v2',
            version: 2,
            latest_version: 2,
            path: '',
            original_file_path: '',
        };
        const mixed = {
            ...model('installed', 'mixed'),
            refs: [
                { name: 'orders', package: null, version: null },
                { name: 'orders', package: 'upstream', version: 2 },
            ],
            depends_on: { nodes: [stub.unique_id, local.unique_id] },
        };
        fetched.manifest.nodes[stub.unique_id] = stub;
        fetched.manifest.nodes[mixed.unique_id] = mixed;
        consumer.fetch.mockResolvedValue(fetched);
        const resolution = await resolve([consumer, scannedTask('upstream')]);
        expect(resolution.warnings).toEqual([]);
    });
    it('does not prepare or inject when disabled', async () => {
        const a = scannedTask('a');
        await resolve([a], false);
        expect(a.prepare).not.toHaveBeenCalled();
    });
});

describe('cross-source hygiene', () => {
    it('continues another retry after the first source exhausts its signature', async () => {
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
                const expectedVariable = {
                    prepare: 'DBT_SOURCE_PREPARE_TIMEOUT_MS',
                    ls: 'DBT_SOURCE_LS_TIMEOUT_MS',
                    resolution: 'DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS',
                }[phase];
                await vi.advanceTimersByTimeAsync(21);
                expect(settled).toEqual([]);
                await vi.runAllTimersAsync();
                expect(await rejected).toHaveProperty(
                    'message',
                    expect.stringContaining(expectedVariable),
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
        expect(dependent.fetch).not.toHaveBeenCalled();
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

it('retries when catalogue contents change at the same resolved count', async () => {
    const provided = result('leaf_a');
    const leaf = task('leaf_a', vi.fn().mockResolvedValue(provided));
    const first = task(
        'ring_0',
        vi
            .fn()
            .mockRejectedValueOnce(missing('leaf_a'))
            .mockRejectedValueOnce(missing('leaf_a'))
            .mockResolvedValue(result('ring_0')),
    );
    let calls = 0;
    const second = task(
        'ring_1',
        vi.fn(async () => {
            calls += 1;
            if (calls === 2)
                (
                    provided.manifest.nodes[
                        'model.leaf_a.orders'
                    ] as DbtRawModelNode
                ).access = 'public';
            throw missing('leaf_a', calls === 1 ? 'before' : 'after');
        }),
    );
    await expect(resolve([first, second, leaf])).rejects.toThrow('after');
    expect(first.fetch).toHaveBeenCalledTimes(3);
    expect(first.fetch.mock.calls[2][0].externalNodes).toEqual([
        expect.objectContaining({ access: 'public' }),
    ]);
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
