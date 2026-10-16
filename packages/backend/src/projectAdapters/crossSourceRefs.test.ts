import {
    DbtError,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
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
        expect(a.fetch).toHaveBeenCalledExactlyOnceWith({ externalNodes: [] });
        expect(b.fetch).toHaveBeenCalledExactlyOnceWith({ externalNodes: [] });
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
    it('lists pending sources and refs when they form a cycle', async () => {
        await expect(
            resolve([
                task('b', vi.fn().mockRejectedValue(missing('c'))),
                task('c', vi.fn().mockRejectedValue(missing('b'))),
            ]),
        ).rejects.toThrow(
            'Cannot resolve cross-source dbt refs: the pending sources depend on each other or on an upstream source that failed. Source "b": c.orders; Source "c": b.orders',
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
        expect(c.fetch).toHaveBeenCalledTimes(1);
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
            'Source "b": a.absent',
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
