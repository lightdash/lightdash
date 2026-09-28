import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDashboardChartBoundaryErrors } from './dashboardFilterBoundaryErrors';

const filters: DashboardFilters = {
    dimensions: [
        {
            id: 'date',
            label: undefined,
            target: { fieldId: 'orders_created_at', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['2026-03-02T04:00:00Z'],
            boundaries: {
                type: 'date',
                mode: 'fixed',
                start: '2026-03-01',
                end: '2026-03-01',
            },
        },
    ],
    metrics: [],
    tableCalculations: [],
};
const fields = [
    {
        name: 'created_at',
        table: 'orders',
        type: DimensionType.TIMESTAMP,
        fieldType: FieldType.DIMENSION,
    },
] as DashboardFilterableField[];
const args = {
    savedFilters: filters,
    filters,
    projectTimezone: 'UTC',
    sessionTimezone: null,
    userTimezone: null,
    context: {},
};

describe('dashboard chart boundary errors', () => {
    it.each([
        { timezone: 'America/New_York', userTimezone: null },
        { timezone: 'user_timezone', userTimezone: 'America/New_York' },
    ])(
        'accepts a timestamp inside the chart day with $timezone',
        ({ timezone, userTimezone }) => {
            expect(
                getDashboardChartBoundaryErrors({
                    ...args,
                    userTimezone,
                    charts: [
                        {
                            tileUuid: 'chart',
                            metricQuery: { timezone },
                            fields,
                        },
                    ],
                }),
            ).toEqual([]);
        },
    );
    it('rejects a selection outside any affected chart and honors excluded tiles', () => {
        const charts = [
            {
                tileUuid: 'new-york',
                metricQuery: { timezone: 'America/New_York' },
                fields,
            },
            {
                tileUuid: 'utc',
                metricQuery: { timezone: 'project_timezone' },
                fields,
            },
        ];
        expect(getDashboardChartBoundaryErrors({ ...args, charts })).toEqual([
            'Choose dates between 2026-03-01 and 2026-03-01.',
        ]);
        const savedFilters = {
            ...filters,
            dimensions: [
                {
                    ...filters.dimensions[0],
                    tileTargets: { utc: false as const },
                },
            ],
        };
        expect(
            getDashboardChartBoundaryErrors({ ...args, savedFilters, charts }),
        ).toEqual([]);
    });
});
