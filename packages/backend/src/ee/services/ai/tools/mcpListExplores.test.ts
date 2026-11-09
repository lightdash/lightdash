import {
    ApiConnectorType,
    ExploreType,
    FilterOperator,
    type ApiSourceExplore,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getMcpListExplores } from './mcpListExplores';

const baseExplore: Explore = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {},
    targetDatabase: 'postgres' as Explore['targetDatabase'],
};

const apiSource: ApiSourceExplore = {
    connectionUuid: 'connection-uuid',
    integration: ApiConnectorType.GA4,
    baseVersion: 1,
    filterGroups: { or: true, nested: true },
    maxDimensions: 9,
    maxMetrics: 10,
    dateRange: { fieldId: 'google_analytics_report_date', defaultDays: 28 },
    fields: {
        google_analytics_report_date: {
            apiName: 'date',
            filterOperators: [
                FilterOperator.IN_THE_PAST,
                FilterOperator.IN_BETWEEN,
                FilterOperator.EQUALS,
            ],
        },
        google_analytics_report_sessions: {
            apiName: 'sessions',
            filterOperators: [],
        },
    },
    incompatible: [
        {
            fields: ['google_analytics_report_item_name'],
            with: ['google_analytics_report_sessions'],
            reason: 'Google Analytics only reports item dimensions with item metrics.',
        },
    ],
};

const liveExplore: Explore = {
    ...baseExplore,
    name: 'google_analytics_report',
    label: 'Google Analytics',
    baseTable: 'google_analytics_report',
    type: ExploreType.API_SOURCE,
    apiSource,
};

const listExplores = async (explores: Explore[]) => {
    const tool = getMcpListExplores({ listExplores: async () => explores });
    const output = await tool.execute!(
        {},
        { toolCallId: 'test', messages: [], context: {} },
    );
    return (output as { result: string }).result;
};

describe('mcpListExplores', () => {
    it('marks a live data source explore and passes its rules', async () => {
        const result = await listExplores([liveExplore]);

        expect(result).toContain(
            '<explore name="google_analytics_report" label="Google Analytics" baseTable="google_analytics_report" type="liveDataSource">',
        );
        expect(result).toContain(
            '<liveDataSource integration="Google Analytics 4" maxDimensions="9" maxMetrics="10" orFilters="true" nestedFilters="true">',
        );
        expect(result).toContain(
            'Funnels, retention, user paths, table calculations',
        );
        expect(result).toContain(
            '<dateRange fieldId="google_analytics_report_date" defaultDays="28">',
        );
        expect(result).toContain('the query reads the last 28 days');
        expect(result).toContain(
            '<field fieldId="google_analytics_report_date" operators="inThePast,inBetween,equals"/>',
        );
        expect(result).not.toContain(
            'fieldId="google_analytics_report_sessions"',
        );
        expect(result).toContain(
            '<incompatible fields="google_analytics_report_item_name" with="google_analytics_report_sessions">',
        );
    });

    it('leaves warehouse explores unmarked', async () => {
        const result = await listExplores([baseExplore]);

        expect(result).toContain(
            '<explore name="orders" label="Orders" baseTable="orders">',
        );
        expect(result).not.toContain('liveDataSource');
    });
});
