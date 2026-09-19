import {
    DbtManifest,
    DbtModelMetadata,
    DbtProjectType,
    DbtRawModelNode,
    DimensionType,
    ensureCatalogTimestampDomainsKey,
    isExploreError,
    ProjectDbtSource,
    SupportedDbtVersions,
    WarehouseCatalog,
    WarehouseClient,
} from '@lightdash/common';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { CompileGroup, CompileGroupsProjectAdapter } from './CompileGroup';
import { DbtManifestProjectAdapter } from './dbtManifestProjectAdapter';

const source = (
    name: string,
    connectionUuid: string,
    isPrimary = false,
): ProjectDbtSource => ({
    name,
    connectionUuid,
    isPrimary,
    projectDbtSourceUuid: `${name}-source`,
    projectUuid: 'project',
    namespacePrefix: isPrimary ? '' : name,
    precedence: isPrimary ? 0 : 1,
    dbtConnection: { type: DbtProjectType.NONE },
    hasCredentialError: false,
    warehouseLocation: { database: null, schema: null },
    createdAt: new Date(0),
    updatedAt: new Date(0),
});

const model = (
    name: string,
    owner: ProjectDbtSource,
    meta: DbtModelMetadata = {},
): DbtRawModelNode => ({
    unique_id: `model.jaffle.${name}`,
    name,
    package_name: 'jaffle',
    resource_type: 'model',
    compiled: true,
    database: 'analytics',
    schema: 'public',
    alias: name,
    checksum: { name: '', checksum: '' },
    fqn: ['jaffle', name],
    language: 'sql',
    path: `models/${name}.sql`,
    raw_code: `select * from ${name}`,
    description: '',
    tags: [],
    depends_on: { nodes: [] },
    patch_path: null,
    original_file_path: `models/${name}.sql`,
    relation_name: `analytics.public.${name}`,
    config: { materialized: 'table', snowflake_warehouse: '' },
    meta,
    columns: { id: { name: 'id', meta: {} } },
    lightdash_source_name: owner.name,
    lightdash_source_uuid: owner.projectDbtSourceUuid,
    lightdash_connection_uuid: owner.connectionUuid,
    lightdash_namespace_prefix: owner.namespacePrefix,
});

const manifest = (models: DbtRawModelNode[]): DbtManifest => ({
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v11.json',
        generated_at: '2026-09-17T00:00:00Z',
        adapter_type: 'postgres',
    },
    nodes: Object.fromEntries(
        models.map((node) => [
            node.unique_id,
            {
                ...node,
                config: {
                    ...node.config,
                    materialized: node.config?.materialized ?? 'table',
                    snowflake_warehouse: node.config?.snowflake_warehouse ?? '',
                },
            },
        ]),
    ),
    metrics: {},
    docs: {},
});

const group = (
    owner: ProjectDbtSource,
    models: DbtRawModelNode[],
    type = DimensionType.NUMBER,
) => {
    const catalog: WarehouseCatalog = {
        analytics: {
            public: Object.fromEntries(
                models.map((node) => [node.name, { id: type }]),
            ),
        },
    };
    ensureCatalogTimestampDomainsKey(catalog);
    const client: WarehouseClient = {
        ...warehouseClientMock,
        test: vi.fn<WarehouseClient['test']>().mockResolvedValue(undefined),
        getCatalog: vi
            .fn<WarehouseClient['getCatalog']>()
            .mockResolvedValue(catalog),
    };
    const onWarehouseCatalogChange = vi.fn();
    const adapter = new CompileGroup({
        parsedManifest: manifest(models),
        connectionUuid: owner.connectionUuid,
        connectionName: owner.connectionUuid,
        dbtVersion: SupportedDbtVersions.V1_9,
        warehouseClient: client,
        cachedWarehouse: {
            warehouseCatalog: undefined,
            onWarehouseCatalogChange,
        },
    });
    return { adapter, client, catalog, onWarehouseCatalogChange };
};

const primary = source('primary', 'London', true);
const additional = source('east', 'Tokyo');
const union = (groups: CompileGroup[], onPrepared = vi.fn(async () => {})) =>
    new CompileGroupsProjectAdapter(
        groups,
        onPrepared,
        vi.fn(async () => {}),
    );

describe('CompileGroup', () => {
    it('waits for active manifest fetches before failed-group cleanup can run', async () => {
        let completeActiveFetch = () => {};
        const active = new Promise<void>((resolve) => {
            completeActiveFetch = resolve;
        });
        const fetched: number[] = [];
        const result = CompileGroup.fetchManifests([0, 1, 2], 2, async (id) => {
            fetched.push(id);
            if (id === 0) throw new Error('manifest failed');
            await active;
            return id;
        });
        let settled = false;
        const observed = result.catch((error: unknown) => {
            settled = true;
            return error;
        });
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(settled).toBe(false);
        expect(fetched).toEqual([0, 1]);
        completeActiveFetch();
        expect(await observed).toEqual(new Error('manifest failed'));
    });

    it('partitions by connection instead of repository or source name', () => {
        const sibling = source('sibling', primary.connectionUuid);
        expect(CompileGroup.partition([primary, additional, sibling])).toEqual([
            [primary, sibling],
            [additional],
        ]);
    });

    it('allows the same manifest IDs on different connections and attaches each catalog independently', async () => {
        const west = group(primary, [model('orders', primary)]);
        const east = group(
            additional,
            [model('orders', additional)],
            DimensionType.STRING,
        );
        const explores = await union([
            west.adapter,
            east.adapter,
        ]).compileAllExplores(undefined);
        expect(explores.map((explore) => explore.name)).toEqual([
            'orders',
            'east__orders',
        ]);
        expect(explores.every((explore) => !isExploreError(explore))).toBe(
            true,
        );
        expect(explores[0]).toMatchObject({
            tables: {
                orders: {
                    connectionUuid: 'London',
                    dbtSourceUuid: 'primary-source',
                    dimensions: { id: { type: DimensionType.NUMBER } },
                },
            },
        });
        expect(explores[1]).toMatchObject({
            tables: {
                east__orders: {
                    connectionUuid: 'Tokyo',
                    dbtSourceUuid: 'east-source',
                    dimensions: { id: { type: DimensionType.STRING } },
                },
            },
        });
        expect(west.client.getCatalog).toHaveBeenCalledTimes(1);
        expect(east.client.getCatalog).toHaveBeenCalledTimes(1);
        expect(west.onWarehouseCatalogChange).toHaveBeenCalledWith(
            west.catalog,
        );
        expect(east.onWarehouseCatalogChange).toHaveBeenCalledWith(
            east.catalog,
        );
    });

    it('rejects duplicate manifest IDs within one connection with the existing collision error', () => {
        const input = manifest([model('orders', primary)]);
        expect(() =>
            CompileGroup.merge([
                { name: 'first', precedence: 0, manifest: input },
                { name: 'second', precedence: 1, manifest: input },
            ]),
        ).toThrow('use the same dbt project name "jaffle"');
    });

    it('records a cross-connection join as one explore error and keeps the other explores', async () => {
        const west = group(primary, [
            model('orders', primary, {
                joins: [
                    {
                        join: 'east__customers',
                        sql_on: '${orders.id} = ${east__customers.id}',
                    },
                ],
                explores: { safe_orders: { joins: [] } },
            }),
        ]);
        const east = group(additional, [model('customers', additional)]);
        const explores = await union([
            west.adapter,
            east.adapter,
        ]).compileAllExplores(undefined);
        expect(explores[0]).toMatchObject({
            name: 'orders',
            errors: [
                { message: expect.stringContaining('connection "London"') },
            ],
        });
        expect(explores[0]).toMatchObject({
            errors: [
                { message: expect.stringContaining('connection "Tokyo"') },
            ],
        });
        expect(explores.filter(isExploreError)).toHaveLength(1);
        expect(explores.map((explore) => explore.name)).toEqual([
            'orders',
            'safe_orders',
            'east__customers',
        ]);
    });

    it('keeps same-source bare joins local when another group has the same model names', async () => {
        const west = group(primary, [
            model('orders', primary),
            model('customers', primary),
        ]);
        const east = group(additional, [
            model('orders', additional, {
                joins: [
                    {
                        join: 'customers',
                        sql_on: '${orders.id} = ${customers.id}',
                    },
                ],
                explores: {
                    recent_orders: {
                        joins: [
                            {
                                join: 'customers',
                                sql_on: '${orders.id} = ${customers.id}',
                            },
                        ],
                    },
                },
            }),
            model('customers', additional),
        ]);
        const explores = await union([
            west.adapter,
            east.adapter,
        ]).compileAllExplores(undefined);
        expect(explores.filter(isExploreError)).toEqual([]);
        expect(explores.map((explore) => explore.name)).toContain(
            'east__recent_orders',
        );
        expect(
            explores.find((explore) => explore.name === 'east__orders'),
        ).toMatchObject({
            joinedTables: [{ table: 'customers' }],
            tables: { customers: { connectionUuid: 'Tokyo' } },
        });
    });

    it.each(['test', 'getCatalog'] as const)(
        'fails preparation before publishing any catalogs when a group cannot %s',
        async (method) => {
            const west = group(primary, [model('orders', primary)]);
            const east = group(additional, [model('orders', additional)]);
            vi.mocked(east.client[method]).mockRejectedValueOnce(
                new Error('bad credentials'),
            );
            const publish = vi.fn(async () => {});
            await expect(
                union(
                    [west.adapter, east.adapter],
                    publish,
                ).prepareExploreStream(undefined),
            ).rejects.toThrow(
                'Failed to compile connection "Tokyo": bad credentials',
            );
            expect(publish).not.toHaveBeenCalled();
        },
    );

    it('matches the existing manifest compiler output byte for byte for one connection', async () => {
        const west = group(primary, [model('orders', primary)]);
        const existing = new DbtManifestProjectAdapter({
            parsedManifest: west.adapter.manifest,
            dbtVersion: SupportedDbtVersions.V1_9,
            warehouseClient: west.client,
            cachedWarehouse: {
                warehouseCatalog: west.catalog,
                onWarehouseCatalogChange: vi.fn(),
            },
        });
        expect(
            JSON.stringify(
                await union([west.adapter]).compileAllExplores(undefined),
            ),
        ).toBe(JSON.stringify(await existing.compileAllExplores(undefined)));
    });

    it('refuses an ambiguous explore name instead of replacing a sibling in the streamed union', async () => {
        const unprefixed = { ...additional, namespacePrefix: '' };
        const west = group(primary, [model('orders', primary)]);
        const east = group(unprefixed, [model('orders', unprefixed)]);
        await expect(
            union([west.adapter, east.adapter]).compileAllExplores(undefined),
        ).rejects.toThrow(
            'Explore name "orders" is used by more than one compile group',
        );
    });
});
