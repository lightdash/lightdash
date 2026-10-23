import { placeholderExternalNode } from '../dbt/dbtExternalNodes';
import Logger from '../logging/logger';
import { type DbtSourceRefCatalogModel } from '../models/DbtSourceRefCatalogModel';
import { CrossSourceCatalogCache } from './crossSourceCatalogCache';

const nodes = [
    placeholderExternalNode({
        packageName: 'provider',
        name: 'orders',
        version: null,
        latestVersion: null,
    }),
];
const setup = () => {
    const model = {
        get: vi.fn(
            async () =>
                [] as {
                    dbt_source_uuid: string;
                    project_name: string;
                    referenced_projects: string[];
                    nodes: typeof nodes;
                }[],
        ),
        replaceConfirmed: vi.fn(async () => undefined),
    };
    const cache = new CrossSourceCatalogCache(
        model as unknown as DbtSourceRefCatalogModel,
        'project',
        'original',
        'v1.9',
        'compile-job',
    );
    return { model, cache };
};

it('loads last-good catalogues by source uuid and stages writes until publication', async () => {
    const { model, cache } = setup();
    model.get.mockResolvedValue([
        {
            dbt_source_uuid: 'source',
            project_name: 'provider',
            nodes,
            referenced_projects: ['upstream'],
        },
    ]);
    expect(
        await cache.load([{ key: 'renamed source', uuid: 'source' }]),
    ).toEqual([
        {
            key: 'renamed source',
            projectName: 'provider',
            nodes,
            referencedProjects: ['upstream'],
        },
    ]);
    await cache.resolved('source', nodes, 'provider', ['upstream']);
    expect(model.replaceConfirmed).not.toHaveBeenCalled();
    expect(cache.rowsWritten).toBe(0);
    await cache.confirm();
    expect(model.replaceConfirmed).toHaveBeenCalledWith({
        projectUuid: 'project',
        connectionGroup: 'original',
        dbtVersion: 'v1.9',
        compileJobUuid: 'compile-job',
        entries: [
            {
                dbtSourceUuid: 'source',
                projectName: 'provider',
                nodes,
                referencedProjects: ['upstream'],
            },
        ],
    });
    expect(cache.rowsLoaded).toBe(1);
    expect(cache.rowsWritten).toBe(1);
});

it('never fails a compile when cache reads, writes or confirmation fail', async () => {
    const { model, cache } = setup();
    const error = new Error('cache unavailable');
    model.get.mockRejectedValue(error);
    model.replaceConfirmed.mockRejectedValue(error);
    expect(await cache.load([])).toEqual([]);
    await expect(
        cache.resolved('source', nodes, 'provider', ['upstream']),
    ).resolves.toBeUndefined();
    await expect(cache.confirm()).resolves.toBeUndefined();
    expect(cache.rowsLoaded).toBe(0);
    expect(cache.rowsWritten).toBe(0);
});

it('counts only rows matched to sources in this compile', async () => {
    const { model, cache } = setup();
    model.get.mockResolvedValue(
        ['matched', 'orphan'].map((dbt_source_uuid) => ({
            dbt_source_uuid,
            project_name: 'p',
            nodes,
            referenced_projects: [],
        })),
    );
    expect(await cache.load([{ key: 'p', uuid: 'matched' }])).toHaveLength(1);
    expect(cache.rowsLoaded).toBe(1);
});

it('logs the cache error message and code without the raw error object', async () => {
    const { model, cache } = setup();
    const warn = vi.spyOn(Logger, 'warn');
    const error = Object.assign(new Error('cache unavailable'), {
        code: '42P01',
        detail: 'internal query details',
    });
    model.get.mockRejectedValue(error);
    await cache.load([]);
    expect(warn).toHaveBeenCalledWith('dbt.compile.crossSourceCacheError', {
        event: 'dbt.compile.crossSourceCacheError',
        message: 'cache unavailable',
        code: '42P01',
    });
    warn.mockRestore();
});

it('does not confirm nodes from a consumer that was skipped after resolution', async () => {
    const { model, cache } = setup();
    await cache.resolved('healthy', nodes, 'provider', []);
    await cache.resolved('skipped', nodes, 'consumer', ['provider']);
    cache.discard('skipped');
    await cache.confirm();
    expect(model.replaceConfirmed).toHaveBeenCalledWith({
        projectUuid: 'project',
        connectionGroup: 'original',
        dbtVersion: 'v1.9',
        compileJobUuid: 'compile-job',
        entries: [
            {
                dbtSourceUuid: 'healthy',
                projectName: 'provider',
                nodes,
                referencedProjects: [],
            },
        ],
    });
});

it('keeps last-good rows unchanged when a refresh stops after resolving a source', async () => {
    const { model, cache } = setup();
    const lastGood = {
        dbt_source_uuid: 'source',
        project_name: 'provider',
        nodes,
        referenced_projects: [],
    };
    model.get.mockResolvedValue([lastGood]);
    await cache.resolved('source', [], 'provider', []);
    const nextRefresh = new CrossSourceCatalogCache(
        model as unknown as DbtSourceRefCatalogModel,
        'project',
        'original',
        'v1.9',
        'next-job',
    );
    expect(
        await nextRefresh.load([{ key: 'provider', uuid: 'source' }]),
    ).toEqual([
        {
            key: 'provider',
            projectName: 'provider',
            nodes,
            referencedProjects: [],
        },
    ]);
    expect(model.replaceConfirmed).not.toHaveBeenCalled();
});
