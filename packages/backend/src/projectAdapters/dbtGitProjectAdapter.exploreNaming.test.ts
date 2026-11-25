import {
    DimensionType,
    ensureCatalogTimestampDomainsKey,
    isExploreError,
    SupportedDbtVersions,
    type DbtManifest,
    type Explore,
    type ExploreError,
    type WarehouseCatalog,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { allocateStagedExploreNames } from '../models/ProjectModel/exploreNameAllocation';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const SAVE = '22222222-2222-2222-2222-222222222222';

const buildModel = (name: string, meta: Record<string, unknown> = {}) => ({
    alias: name,
    checksum: { name: '', checksum: '' },
    fqn: [],
    language: 'sql',
    package_name: 'pkg',
    path: `${name}.sql`,
    raw_code: '',
    compiled: true,
    unique_id: `model.pkg.${name}`,
    description: '',
    resource_type: 'model',
    columns: {
        id: { name: 'id', meta: {} },
        person_id: { name: 'person_id', meta: {} },
    },
    meta,
    config: { meta },
    database: 'db',
    schema: 'sch',
    name,
    tags: [],
    relation_name: `"db"."sch"."${name}"`,
    depends_on: { nodes: [] },
    patch_path: null,
    original_file_path: `${name}.sql`,
});

const models = [
    buildModel('schools', {
        joins: [
            {
                join: 'activity_logs',
                alias: 'admin_logs',
                sql_on: '${schools.id} = ${admin_logs.person_id}',
            },
            {
                join: 'activity_logs',
                alias: 'student_logs',
                sql_on: '${schools.person_id} = ${student_logs.person_id}',
            },
            {
                join: 'profiles',
                alias: 'admin_profiles',
                sql_on: '${schools.id} = ${admin_profiles.person_id}',
            },
        ],
    }),
    buildModel('activity_logs'),
    buildModel('profiles'),
];

const manifest = {
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v11.json',
        generated_at: '2026-01-01T00:00:00.000000Z',
        adapter_type: 'postgres',
    },
    nodes: Object.fromEntries(models.map((model) => [model.unique_id, model])),
    metrics: {},
    docs: {},
} as unknown as DbtManifest;

const buildCatalog = (): WarehouseCatalog => {
    const catalog: WarehouseCatalog = {
        db: {
            sch: Object.fromEntries(
                models.map((model) => [
                    model.name,
                    {
                        id: DimensionType.NUMBER,
                        person_id: DimensionType.NUMBER,
                    },
                ]),
            ),
        },
    };
    ensureCatalogTimestampDomainsKey(catalog);
    return catalog;
};

const buildGitAdapter = () => {
    const adapter = new DbtBaseProjectAdapter(
        {
            installDeps: vi.fn(async () => undefined),
            getDbtManifest: vi.fn(async () => ({
                manifest: structuredClone(manifest),
            })),
        } as unknown as DbtGitProjectAdapter['dbtClient'],
        warehouseClientMock,
        {
            warehouseCatalog: buildCatalog(),
            onWarehouseCatalogChange: vi.fn(),
        },
        SupportedDbtVersions.V1_7,
    );
    Object.setPrototypeOf(adapter, DbtGitProjectAdapter.prototype);
    Object.defineProperty(adapter, '_refreshRepo', {
        value: vi.fn(async () => undefined),
    });
    return adapter as DbtGitProjectAdapter;
};

const compileThroughGitAdapter = async () => {
    const stream = await buildGitAdapter().prepareExploreStream(
        undefined,
        false,
        true,
        true,
    );
    const explores: (Explore | ExploreError)[] = [];
    for await (const explore of stream) explores.push(explore);
    return explores;
};

type State = {
    sources: { project_dbt_source_uuid: string; name: string }[];
    allocations: Record<string, unknown>[];
    staged: Record<string, unknown>[];
};

const allocate = async (state: State) => {
    const db = knex({ client: MockClient });
    const tracker = getTracker();
    tracker.reset();
    tracker.on.any(/.*/).response((query: { sql: string; method: string }) => {
        const { sql, method } = query;
        const table = /(?:from|into|update)\s+"([a-z_]+)"/i.exec(sql)?.[1];
        if (method === 'first' && table === 'projects')
            return { dbt_source_uuid: null, dbt_source_name: null };
        if (method === 'select' && table === 'project_dbt_sources')
            return state.sources;
        if (method === 'select' && table === 'explore_name_allocations')
            return state.allocations;
        if (method === 'select' && table === 'cached_explore_staging')
            return state.staged;
        return [];
    });
    const inserted: Record<string, unknown>[] = [];
    const result = await allocateStagedExploreNames(
        new Proxy(db, {
            apply(target, thisArg, args) {
                const builder = Reflect.apply(target, thisArg, args);
                if (args[0] === 'explore_name_allocations') {
                    const insert = builder.insert.bind(builder);
                    builder.insert = (rows: Record<string, unknown>[]) => {
                        inserted.push(...rows);
                        return insert(rows);
                    };
                }
                return builder;
            },
        }) as never,
        PROJECT,
        SAVE,
        {
            mode: 'refresh',
            models: [],
            refreshedSourceUuids: [PROJECT],
            warnings: [],
        },
    );
    return { result, inserted };
};

const stage = (explores: (Explore | ExploreError)[]) =>
    structuredClone(explores).map((explore) => ({
        project_uuid: PROJECT,
        save_uuid: SAVE,
        name: explore.name,
        table_names: Object.keys(explore.tables ?? {}),
        explore,
    }));

const schoolsExplore = (explores: (Explore | ExploreError)[]) => {
    const explore = explores.find(
        (item) =>
            item.dbtModelIdentity?.modelName === 'schools' ||
            item.name === 'schools',
    );
    if (!explore || isExploreError(explore))
        throw new Error('schools explore did not compile');
    return explore;
};

describe('Git adapter compile with leftover explore name allocations', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps join aliases to a model that is also an explore on refresh', async () => {
        const created = await allocate({
            sources: [
                { project_dbt_source_uuid: 'extra-source', name: 'extra' },
            ],
            allocations: [],
            staged: stage(await compileThroughGitAdapter()),
        });
        const leftoverAllocations = created.inserted.map((row, index) => ({
            explore_name_allocation_uuid: `allocation-${index}`,
            is_reserved: false,
            ...row,
        }));
        expect(leftoverAllocations.length).toBeGreaterThan(0);

        const refreshed = await allocate({
            sources: [],
            allocations: leftoverAllocations,
            staged: stage(await compileThroughGitAdapter()),
        });
        const explore = schoolsExplore(refreshed.result.explores);

        expect(explore.joinedTables.map((join) => join.table)).toEqual([
            'admin_logs',
            'student_logs',
            'admin_profiles',
        ]);
        expect(Object.keys(explore.tables).sort()).toEqual(
            [
                explore.baseTable,
                'admin_logs',
                'student_logs',
                'admin_profiles',
            ].sort(),
        );
    });
});
