import {
    DbtProjectType,
    ExploreType,
    ExternalSourceStatus,
    ExternalSourceType,
    WarehouseTypes,
    type ExternalConnectionListItem,
    type ExternalSource,
    type Project as LightdashProject,
    type SummaryExplore,
    type WarehouseConnection,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildRealProject } from './realProject';

const lightdashProject = {
    projectUuid: 'p',
    name: 'Jaffle shop',
    organizationUuid: 'org',
    warehouseConnection: { type: WarehouseTypes.POSTGRES },
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        repository: 'acme/analytics',
        branch: 'main',
    },
} as unknown as LightdashProject;

const summary = (
    name: string,
    overrides: Record<string, unknown> = {},
): SummaryExplore =>
    ({
        name,
        label: name,
        tags: [],
        groupLabel: undefined,
        groups: undefined,
        databaseName: 'db',
        schemaName: 'public',
        description: '',
        warehouseConnectionUuid: null,
        ...overrides,
    }) as unknown as SummaryExplore;

const csvRef = {
    sourceUuid: 'csv-1',
    tableUuid: 't-1',
    sourceType: ExternalSourceType.CSV,
};

const csvSource = {
    sourceUuid: 'csv-1',
    type: ExternalSourceType.CSV,
    name: 'sales_targets',
    connection: {
        type: ExternalSourceType.CSV,
        originalFilename: 'targets.csv',
    },
    status: ExternalSourceStatus.ERROR,
    errorMessage: 'Column count changed',
} as unknown as ExternalSource;

const connection = (
    uuid: string,
    name: string,
    liveSourceName: string | null,
): ExternalConnectionListItem =>
    ({
        externalConnectionUuid: uuid,
        name,
        liveSourceName,
        apiSource: { connector: 'posthog' },
    }) as unknown as ExternalConnectionListItem;

const explores: SummaryExplore[] = [
    summary('orders', { groups: ['sales', 'core'] }),
    summary('customers', {
        groupLabel: 'People',
        description: 'All customers',
    }),
    summary('broken', { errors: [{ message: 'Missing column id' }] }),
    summary('big_orders', { type: ExploreType.VIRTUAL }),
    summary('sales_targets', {
        type: ExploreType.EXTERNAL_SOURCE,
        externalSource: csvRef,
    }),
    summary('posthog_events', { type: ExploreType.API_SOURCE }),
    summary('posthog_2_events', { type: ExploreType.API_SOURCE }),
    summary('stripe_charges', {
        type: ExploreType.API_SOURCE,
        label: 'Stripe charges',
    }),
    summary('orders_rollup', { type: ExploreType.PRE_AGGREGATE }),
];

describe('buildRealProject', () => {
    const everything = buildRealProject({
        project: lightdashProject,
        explores,
        externalSources: [csvSource],
        liveConnections: [
            connection('c-1', 'PostHog', 'posthog'),
            connection('c-2', 'PostHog EU', 'posthog_2'),
        ],
    });
    const sourceOf = (exploreName: string) => {
        const explore = everything.explores.find(
            ({ name }) => name === exploreName,
        );
        return everything.sources.find(({ id }) => id === explore?.sourceId);
    };

    it('names the warehouse and where the dbt project lives', () => {
        expect(everything.warehouse).toEqual({
            type: 'postgres',
            label: 'PostgreSQL',
        });
        expect(sourceOf('orders')).toMatchObject({
            kind: 'modelled',
            origin: 'acme/analytics @ main',
        });
    });

    it('keeps groups, falling back to the group label', () => {
        const byName = new Map(
            everything.explores.map((explore) => [explore.name, explore]),
        );
        expect(byName.get('orders')?.groupPath).toEqual(['sales', 'core']);
        expect(byName.get('customers')?.groupPath).toEqual(['People']);
        expect(byName.get('customers')?.description).toBe('All customers');
    });

    it('shows explores that failed to compile, with their errors', () => {
        expect(
            everything.explores.find(({ name }) => name === 'broken')?.warnings,
        ).toEqual(['Missing column id']);
    });

    it('sorts virtual views, external sources and live sources into their kinds', () => {
        expect(sourceOf('big_orders')?.kind).toBe('sqlViews');
        expect(sourceOf('sales_targets')).toMatchObject({
            kind: 'files',
            type: 'csv',
            name: 'targets.csv',
            status: 'Column count changed',
        });
        expect(sourceOf('posthog_events')).toMatchObject({
            kind: 'live',
            name: 'PostHog',
            connectionUuid: 'c-1',
        });
    });

    it('matches the longest live source name first', () => {
        expect(sourceOf('posthog_2_events')?.name).toBe('PostHog EU');
    });

    it('gives an unlisted live explore its own source, named after it', () => {
        expect(sourceOf('stripe_charges')).toMatchObject({
            id: 'live:stripe_charges',
            kind: 'live',
            name: 'Stripe charges',
        });
        expect(sourceOf('stripe_charges')?.connectionUuid).toBeUndefined();
    });

    it('gives a live data source without explores its own page', () => {
        const project = buildRealProject({
            project: lightdashProject,
            explores,
            externalSources: [],
            liveConnections: [
                connection('c-1', 'PostHog', 'posthog'),
                connection('c-3', 'Fresh PostHog', 'posthog_3'),
            ],
        });
        expect(project.sources.find(({ id }) => id === 'c-3')).toMatchObject({
            kind: 'live',
            name: 'Fresh PostHog',
            connectionUuid: 'c-3',
            settingsPath: null,
        });
        expect(
            project.explores.some(({ sourceId }) => sourceId === 'c-3'),
        ).toBe(false);
    });

    it('leaves out pre-aggregates', () => {
        expect(
            everything.explores.some(({ name }) => name === 'orders_rollup'),
        ).toBe(false);
    });

    it('registers each source once', () => {
        const ids = everything.sources.map(({ id }) => id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('still shows external and live explores to people who cannot list their sources', () => {
        const limited = buildRealProject({
            project: lightdashProject,
            explores,
            externalSources: [],
            liveConnections: [],
        });
        const names = limited.explores.map(({ name }) => name);
        expect(names).toEqual(
            expect.arrayContaining([
                'sales_targets',
                'posthog_events',
                'stripe_charges',
            ]),
        );
        const csv = limited.sources.find(({ id }) => id === 'csv-1');
        expect(csv).toMatchObject({
            kind: 'files',
            type: 'csv',
            name: 'sales_targets',
            status: null,
        });
        const live = limited.sources.filter(({ kind }) => kind === 'live');
        expect(live).toHaveLength(3);
        // The integration, and so its logo, still comes from the name.
        expect(live.map(({ integration }) => integration)).toEqual([
            'posthog',
            'posthog',
            // Not an available integration: the generic icon.
            undefined,
        ]);
    });
});

describe('buildRealProject with several warehouses', () => {
    const warehouseConnection = (
        uuid: string,
        name: string,
        isOriginal: boolean,
        warehouseType = WarehouseTypes.POSTGRES,
    ): WarehouseConnection =>
        ({
            warehouseConnectionUuid: uuid,
            name,
            isOriginal,
            warehouseType,
        }) as WarehouseConnection;
    const bound = [
        summary('orders'),
        summary('events', { warehouseConnectionUuid: 'wc-2' }),
        summary('ghost', { warehouseConnectionUuid: 'wc-9' }),
    ];
    const build = (warehouseConnections?: WarehouseConnection[] | null) =>
        buildRealProject({
            project: lightdashProject,
            explores: bound,
            externalSources: [],
            liveConnections: [],
            warehouseConnections,
        });
    const sourceIdOf = (
        project: ReturnType<typeof build>,
        exploreName: string,
    ) => project.explores.find(({ name }) => name === exploreName)?.sourceId;

    it('keeps one warehouse when the flag is off', () => {
        const project = build();
        expect(project.multipleWarehouses).toBe(false);
        expect(project.sources.map(({ id }) => id)).toEqual(['warehouse']);
        expect(sourceIdOf(project, 'events')).toBe('warehouse');
        expect(project.sources[0].warehouse).toBeUndefined();
    });

    it('gives each connection its own source, the original keeping its id', () => {
        const project = build([
            warehouseConnection('wc-1', 'Main Postgres', true),
            warehouseConnection(
                'wc-2',
                'Analytics',
                false,
                WarehouseTypes.SNOWFLAKE,
            ),
        ]);
        expect(project.multipleWarehouses).toBe(true);
        expect(sourceIdOf(project, 'orders')).toBe('warehouse');
        expect(sourceIdOf(project, 'events')).toBe('warehouse:wc-2');
        expect(
            project.sources.find(({ id }) => id === 'warehouse:wc-2'),
        ).toMatchObject({
            kind: 'modelled',
            name: 'Analytics',
            warehouse: { type: 'snowflake', label: 'Snowflake' },
        });
    });

    it('lists a connection with no explores yet', () => {
        const project = build([
            warehouseConnection('wc-1', 'Main Postgres', true),
            warehouseConnection('wc-3', 'Empty', false),
        ]);
        expect(project.sources.map(({ id }) => id)).toContain('warehouse:wc-3');
    });

    it('names a connection the person cannot list for what it is', () => {
        const project = build([]);
        expect(sourceIdOf(project, 'orders')).toBe('warehouse');
        expect(
            project.sources.find(({ id }) => id === 'warehouse:wc-9'),
        ).toMatchObject({ name: 'Other warehouse', onWarehouse: false });
    });
});
