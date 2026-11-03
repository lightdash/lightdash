import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type CompiledDimension,
    type Explore,
    type FunnelStep,
} from '@lightdash/common';
import type { FunnelSqlInput } from './funnelSql';

const makeDimension = (
    name: string,
    type: DimensionType,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table: 'events',
    tableLabel: 'Events',
    sql: `\${TABLE}.${name}`,
    compiledSql: `"events".${name}`,
    tablesReferences: ['events'],
    hidden: false,
});

export const eventsExplore: Explore = {
    name: 'events',
    label: 'Events',
    tags: [],
    baseTable: 'events',
    joinedTables: [],
    tables: {
        events: {
            name: 'events',
            label: 'Events',
            database: 'db',
            schema: 'public',
            sqlTable: '"public"."events"',
            dimensions: {
                user_id: makeDimension('user_id', DimensionType.STRING),
                event_name: makeDimension('event_name', DimensionType.STRING),
                created_at: makeDimension(
                    'created_at',
                    DimensionType.TIMESTAMP,
                ),
                country: makeDimension('country', DimensionType.STRING),
            },
            metrics: {},
            lineageGraph: {},
        },
    },
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

export const funnelSteps: FunnelStep[] = [
    { stepOrder: 1, eventName: 'signup' },
    { stepOrder: 2, eventName: "user's first query" },
    { stepOrder: 3, eventName: 'invite' },
];

export const funnelDefinition: FunnelSqlInput = {
    userIdFieldId: 'events_user_id',
    timestampFieldId: 'events_created_at',
    eventNameFieldId: 'events_event_name',
    steps: funnelSteps,
    dateRange: {
        type: 'custom',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-02-01T00:00:00.000Z',
    },
};
