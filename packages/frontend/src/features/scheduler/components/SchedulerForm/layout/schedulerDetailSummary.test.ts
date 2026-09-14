import {
    FilterOperator,
    SchedulerFormat,
    ThresholdOperator,
    type SchedulerAndTargets,
} from '@lightdash/common'; // pragma: allowlist secret
import { describe, expect, it } from 'vitest';
import {
    getAlertConditionSummaries,
    getSchedulerFilterSummaries,
    getSchedulerParameterSummaries,
} from './schedulerDetailSummary';

const chartScheduler = (
    overrides: Partial<SchedulerAndTargets>,
): SchedulerAndTargets =>
    ({
        schedulerUuid: 'scheduler-uuid',
        slug: 'test-alert',
        name: 'Test',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        createdBy: 'user-1',
        createdByName: 'Jane',
        format: SchedulerFormat.IMAGE,
        cron: '22 * * * *',
        savedChartUuid: 'chart-1',
        savedChartName: 'Orders',
        dashboardUuid: null,
        dashboardName: null,
        savedSqlUuid: null,
        savedSqlName: null,
        appUuid: null,
        appName: null,
        options: {},
        enabled: true,
        includeLinks: true,
        plainTextEmail: false,
        targets: [],
        ...overrides,
    }) as SchedulerAndTargets;

const dashboardScheduler = (
    overrides: Partial<SchedulerAndTargets>,
): SchedulerAndTargets =>
    ({
        ...chartScheduler({
            savedChartUuid: null,
            savedChartName: null,
            dashboardUuid: 'dashboard-1',
            dashboardName: 'Sales',
            selectedTabs: null,
        }),
        ...overrides,
    }) as SchedulerAndTargets;

describe('getAlertConditionSummaries', () => {
    it('returns nothing without thresholds', () => {
        expect(getAlertConditionSummaries(undefined)).toEqual([]);
        expect(getAlertConditionSummaries([])).toEqual([]);
    });

    it('summarises comparison and percent thresholds', () => {
        expect(
            getAlertConditionSummaries([
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'orders_order_count',
                    value: 100,
                },
                {
                    operator: ThresholdOperator.INCREASED_BY,
                    fieldId: 'payments_total_revenue',
                    value: 10,
                },
            ]),
        ).toEqual([
            {
                field: 'Orders order count',
                operator: 'is greater than',
                value: '100',
            },
            {
                field: 'Payments total revenue',
                operator: 'increased by',
                value: '10%',
            },
        ]);
    });
});

describe('getSchedulerFilterSummaries', () => {
    it('summarises chart filter rules', () => {
        const summaries = getSchedulerFilterSummaries(
            chartScheduler({
                filters: {
                    dimensions: {
                        id: 'and-1',
                        and: [
                            {
                                id: 'status',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                            {
                                id: 'empty',
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: [],
                            },
                        ],
                    },
                },
            }),
        );

        expect(summaries).toEqual([
            {
                field: 'Orders status',
                operator: 'is',
                value: 'completed',
            },
        ]);
    });

    it('summarises dashboard filter overrides and skips disabled rules', () => {
        const summaries = getSchedulerFilterSummaries(
            dashboardScheduler({
                filters: [
                    {
                        id: 'status',
                        target: {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                        label: 'Status',
                    },
                    {
                        id: 'amount',
                        target: {
                            fieldId: 'payments_amount',
                            tableName: 'payments',
                        },
                        operator: FilterOperator.GREATER_THAN,
                        values: [50],
                        label: undefined,
                        disabled: true,
                    },
                ],
            }),
        );

        expect(summaries).toEqual([
            {
                field: 'Status',
                operator: 'is',
                value: 'completed',
            },
        ]);
    });
});

describe('getSchedulerParameterSummaries', () => {
    it('formats scalar and list parameter values', () => {
        expect(
            getSchedulerParameterSummaries({
                date_granularity: 'month',
                status: ['completed', 'pending'],
            }),
        ).toEqual([
            {
                field: 'Date granularity',
                operator: 'is',
                value: 'month',
            },
            {
                field: 'Status',
                operator: 'is',
                value: 'completed, pending',
            },
        ]);
    });
});
