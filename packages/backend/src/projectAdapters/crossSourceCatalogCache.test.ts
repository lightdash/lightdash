import { type Knex } from 'knex';
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
const setup = (deferWrites = false) => {
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
        upsertProvisional: vi.fn(async () => 'digest'),
        confirm: vi.fn(async () => undefined),
    };
    const cache = new CrossSourceCatalogCache(
        model as unknown as DbtSourceRefCatalogModel,
        'project',
        'original',
        'v1.9',
        'compile-job',
        deferWrites,
    );
    return { model, cache };
};

it('loads provisional or confirmed catalogues by source uuid and writes the compile job identity', async () => {
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
    expect(model.upsertProvisional).toHaveBeenCalledWith({
        projectUuid: 'project',
        dbtSourceUuid: 'source',
        connectionGroup: 'original',
        projectName: 'provider',
        dbtVersion: 'v1.9',
        nodes,
        referencedProjects: ['upstream'],
        compileJobUuid: 'compile-job',
    });
    await cache.confirm();
    expect(model.confirm).toHaveBeenCalledWith({
        projectUuid: 'project',
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: 'source', nodesDigest: 'digest' }],
    });
    expect(cache.rowsLoaded).toBe(1);
    expect(cache.rowsWritten).toBe(1);
});

it('never fails a compile when cache reads, writes or confirmation fail', async () => {
    const { model, cache } = setup();
    const error = new Error('cache unavailable');
    model.get.mockRejectedValue(error);
    model.upsertProvisional.mockRejectedValue(error);
    model.confirm.mockRejectedValue(error);
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
    expect(model.confirm).toHaveBeenCalledWith({
        projectUuid: 'project',
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: 'healthy', nodesDigest: 'digest' }],
    });
});

it('defers provisional writes until publication and discards skipped sources before flushing', async () => {
    const { model, cache } = setup(true);
    const trx = {} as Knex.Transaction;
    await cache.resolved('up_1', nodes, 'project_a', []);
    await cache.resolved('up_2', nodes, 'project_b', ['project_a']);
    expect(model.upsertProvisional).not.toHaveBeenCalled();
    expect(model.confirm).not.toHaveBeenCalled();
    cache.discard('up_2');
    await cache.confirm(trx);
    expect(model.upsertProvisional).toHaveBeenCalledExactlyOnceWith(
        {
            projectUuid: 'project',
            dbtSourceUuid: 'up_1',
            connectionGroup: 'original',
            projectName: 'project_a',
            dbtVersion: 'v1.9',
            nodes,
            referencedProjects: [],
            compileJobUuid: 'compile-job',
        },
        trx,
    );
    expect(model.confirm).toHaveBeenCalledExactlyOnceWith(
        {
            projectUuid: 'project',
            connectionGroup: 'original',
            entries: [{ dbtSourceUuid: 'up_1', nodesDigest: 'digest' }],
        },
        trx,
    );
});

it.each(['upsertProvisional', 'confirm'] as const)(
    'propagates a deferred %s failure so the publication transaction can roll back',
    async (method) => {
        const { model, cache } = setup(true);
        const trx = {} as Knex.Transaction;
        const error = new Error('Publication artifact write failed');
        model[method].mockRejectedValue(error);
        await cache.resolved('up_1', nodes, 'project_a', []);
        await expect(cache.confirm(trx)).rejects.toBe(error);
        expect(model.upsertProvisional).toHaveBeenCalledWith(
            expect.objectContaining({ dbtSourceUuid: 'up_1' }),
            trx,
        );
        if (method === 'upsertProvisional')
            expect(model.confirm).not.toHaveBeenCalled();
        else
            expect(model.confirm).toHaveBeenCalledWith(
                expect.objectContaining({
                    entries: [{ dbtSourceUuid: 'up_1', nodesDigest: 'digest' }],
                }),
                trx,
            );
    },
);
