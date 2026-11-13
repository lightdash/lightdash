import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type Explore as CompiledExplore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type Project } from './model';
import {
    matchExploreFields,
    uncataloguedExploreIds,
} from './sourceFieldSearch';

const dimension = (
    table: string,
    name: string,
    overrides: Partial<CompiledDimension> = {},
) =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name,
        label: name,
        table,
        tableLabel: table,
        sql: name,
        compiledSql: name,
        tablesReferences: [table],
        hidden: false,
        ...overrides,
    }) as CompiledDimension;

const metric = (table: string, name: string, label = name) =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name,
        label,
        table,
        tableLabel: table,
        sql: name,
        compiledSql: name,
        tablesReferences: [table],
        hidden: false,
    }) as CompiledMetric;

const compiledExplore = (
    name: string,
    dimensions: CompiledDimension[],
    metrics: CompiledMetric[] = [],
    baseTable = name,
) =>
    ({
        name,
        label: name,
        baseTable,
        joinedTables: [],
        tags: [],
        targetDatabase: 'postgres',
        tables: {
            [baseTable]: {
                name: baseTable,
                label: baseTable,
                dimensions: Object.fromEntries(
                    dimensions.map((d) => [d.name, d]),
                ),
                metrics: Object.fromEntries(metrics.map((m) => [m.name, m])),
            },
        },
    }) as unknown as CompiledExplore;

describe('uncataloguedExploreIds', () => {
    it('lists explores of external and live data sources only', () => {
        const project = {
            id: 'p',
            name: 'Shop',
            warehouse: undefined,
            sources: [
                { id: 'warehouse', kind: 'modelled' },
                { id: 'virtual-views', kind: 'sqlViews' },
                { id: 'csv', kind: 'files' },
                { id: 'posthog', kind: 'live' },
            ],
            explores: [
                { id: 'orders', sourceId: 'warehouse' },
                { id: 'view', sourceId: 'virtual-views' },
                { id: 'leads_csv', sourceId: 'csv' },
                { id: 'posthog_events', sourceId: 'posthog' },
            ],
        } as unknown as Project;
        expect(uncataloguedExploreIds(project)).toEqual([
            'leads_csv',
            'posthog_events',
        ]);
    });
});

describe('matchExploreFields', () => {
    const events = compiledExplore(
        'posthog_events',
        [
            dimension('posthog_events', 'event_name', { label: 'Event name' }),
            dimension('posthog_events', 'secret_event', { hidden: true }),
            dimension('posthog_events', 'event_at_day', {
                timeIntervalBaseDimensionName: 'event_at',
            }),
        ],
        [metric('posthog_events', 'event_count', 'Events')],
    );

    it('matches visible fields by label or name, case-insensitively', () => {
        expect(matchExploreFields([events], '  EVENT ')).toEqual([
            {
                name: 'event_name',
                label: 'Event name',
                tableName: 'posthog_events',
                exploreId: 'posthog_events',
                fieldType: 'dimension',
            },
            {
                name: 'event_count',
                label: 'Events',
                tableName: 'posthog_events',
                exploreId: 'posthog_events',
                fieldType: 'metric',
            },
        ]);
    });

    it('finds nothing for blank text', () => {
        expect(matchExploreFields([events], ' ')).toEqual([]);
    });

    it('keeps the explore when its base table has another name', () => {
        const leads = compiledExplore(
            'leads_csv',
            [dimension('leads', 'email')],
            [],
            'leads',
        );
        expect(matchExploreFields([leads], 'mail')).toEqual([
            expect.objectContaining({
                tableName: 'leads',
                exploreId: 'leads_csv',
            }),
        ]);
    });
});
