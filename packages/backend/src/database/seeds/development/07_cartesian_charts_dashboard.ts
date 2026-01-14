import {
    CartesianSeriesType,
    ChartType,
    CreateDashboardChartTile,
    DashboardTileTypes,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

type ChartUuids = Record<string, string>;

async function createCharts(knex: Knex): Promise<ChartUuids> {
    const savedChartModel = new SavedChartModel({
        database: knex,
        lightdashConfig,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const { space_uuid: spaceUuid } = await spaceModel.getFirstAccessibleSpace(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    const chartUuids: ChartUuids = {};

    // Chart 1: day ref
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('day ref'),
            name: 'day ref',
            description:
                'The chart illustrates the daily count of events, highlighting trends and fluctuations over time.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_day',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: { field: 'events_count' },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dayRef = chart1.uuid;

    // Chart 2: week
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('week'),
            name: 'week',
            description: 'Weekly event count showing trends over time.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_week'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_week',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'events_date_week' },
                                    yRef: { field: 'events_count' },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_week',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.week = chart2.uuid;

    // Chart 3: month
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('month'),
            name: 'month',
            description: 'Monthly event count showing trends over time.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_month'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_month',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'events_date_month' },
                                    yRef: { field: 'events_count' },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_month',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.month = chart3.uuid;

    // Chart 4: quarter
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('quarter'),
            name: 'quarter',
            description: 'Quarterly event count showing trends over time.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_quarter'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_quarter',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'events_date_quarter' },
                                    yRef: { field: 'events_count' },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_quarter',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.quarter = chart4.uuid;

    // Chart 5: day, stacked (with pivot)
    const chart5 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('day, stacked'),
            name: 'day, stacked',
            description:
                'Daily event count with stacked bars showing event tiers.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_day',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                stack: 'stack1',
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: { field: 'events_count' },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dayStacked = chart5.uuid;

    // Chart 6: day stacked 100% refs
    const chart6 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('day stacked 100% refs'),
            name: 'day stacked 100% refs',
            description:
                'Daily event distribution showing percentage of each event tier.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_day',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                stack: 'stack1',
                                stackLabel: {
                                    show: true,
                                },
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: { field: 'events_count' },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.dayStacked100 = chart6.uuid;

    // Chart 7: Copy of How does the count of events vary by date? (LINE chart with pivot)
    const chart7 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug(
                'Copy of How does the count of events vary by date?',
            ),
            name: 'Copy of How does the count of events vary by date?',
            description:
                'Event count variation over time shown as a line chart.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'events_date_day',
                        yField: ['events_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.lineChart = chart7.uuid;

    // Chart 8: Copy of day, stacked (AREA chart with pivot)
    const chart8 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('Copy of day, stacked'),
            name: 'Copy of day, stacked',
            description: 'Daily event count shown as stacked area chart.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'stack',
                        xField: 'events_date_day',
                        yField: ['events_count'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.areaChart = chart8.uuid;

    // Chart 9: Copy of day stacked 100% refs (AREA 100% with pivot)
    const chart9 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('Copy of day stacked 100% refs'),
            name: 'Copy of day stacked 100% refs',
            description:
                'Daily event distribution shown as 100% stacked area chart.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'stack100',
                        xField: 'events_date_day',
                        yField: ['events_count'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'events_count',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.areaChart100 = chart9.uuid;

    // Chart 10: month (visit_analytics with pivot)
    const chart10 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('month'),
            name: 'month',
            description: 'Monthly visit analytics showing trends over time.',
            tableName: 'visit_analytics',
            metricQuery: {
                exploreName: 'visit_analytics',
                dimensions: [
                    'visit_analytics_visit_date_month',
                    'visit_analytics_bmi_category',
                ],
                metrics: ['visit_analytics_total_visits'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'visit_analytics_bmi_category',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['visit_analytics_bmi_category'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'visit_analytics_visit_date_month',
                        yField: ['visit_analytics_total_visits'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: {
                                        field: 'visit_analytics_visit_date_month',
                                    },
                                    yRef: {
                                        field: 'visit_analytics_total_visits',
                                    },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'visit_analytics_visit_date_month',
                    'visit_analytics_bmi_category',
                    'visit_analytics_total_visits',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.visitMonth = chart10.uuid;

    // Chart 11: month (visit_analytics with flipAxes and pivot)
    const chart11 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug(' month'),
            name: ' month',
            description:
                'Monthly visit analytics with alternative visualization.',
            tableName: 'visit_analytics',
            metricQuery: {
                exploreName: 'visit_analytics',
                dimensions: [
                    'visit_analytics_visit_date_month',
                    'visit_analytics_bmi_category',
                ],
                metrics: ['visit_analytics_total_visits'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'visit_analytics_bmi_category',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['visit_analytics_bmi_category'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'visit_analytics_visit_date_month',
                        yField: ['visit_analytics_total_visits'],
                        flipAxes: true,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: {
                                        field: 'visit_analytics_visit_date_month',
                                    },
                                    yRef: {
                                        field: 'visit_analytics_total_visits',
                                        pivotValues: [
                                            {
                                                field: 'visit_analytics_bmi_category',
                                                value: 'Normal',
                                            },
                                        ],
                                    },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: {
                                        field: 'visit_analytics_visit_date_month',
                                    },
                                    yRef: {
                                        field: 'visit_analytics_total_visits',
                                        pivotValues: [
                                            {
                                                field: 'visit_analytics_bmi_category',
                                                value: 'Obese',
                                            },
                                        ],
                                    },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: {
                                        field: 'visit_analytics_visit_date_month',
                                    },
                                    yRef: {
                                        field: 'visit_analytics_total_visits',
                                        pivotValues: [
                                            {
                                                field: 'visit_analytics_bmi_category',
                                                value: 'Overweight',
                                            },
                                        ],
                                    },
                                },
                                markLine: {
                                    data: [
                                        {
                                            type: 'average',
                                            uuid: uuidv4(),
                                            label: {
                                                position: 'end',
                                            },
                                            lineStyle: {
                                                color: '#000',
                                            },
                                        },
                                    ],
                                    symbol: 'none',
                                    lineStyle: {
                                        type: 'solid',
                                        color: '#000',
                                        width: 3,
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'visit_analytics_visit_date_month',
                    'visit_analytics_bmi_category',
                    'visit_analytics_total_visits',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.visitMonth2 = chart11.uuid;

    // Chart 13: Orders area 100% by month (orders explore)
    const chart13 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('orders area month'),
            name: 'orders area month',
            description: 'Order amounts by shipping method area.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [
                    'orders_order_date_month',
                    'orders_shipping_method',
                ],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_total_order_amount',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['orders_shipping_method'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'stack',
                        xField: 'orders_order_date_month',
                        yField: ['orders_total_order_amount'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'standard',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'overnight',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'express',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_shipping_method',
                    'orders_total_order_amount',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.ordersAreaMonth = chart13.uuid;

    // Chart 14: Orders area 100% by year (orders explore)
    const chart14 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('orders area 100% year'),
            name: 'orders area 100% year',
            description:
                'Yearly order amounts by shipping method as 100% stacked area.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [
                    'orders_order_date_year',
                    'orders_shipping_method',
                ],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_total_order_amount',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['orders_shipping_method'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'stack100',
                        xField: 'orders_order_date_year',
                        yField: ['orders_total_order_amount'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_year' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'standard',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_year' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'overnight',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                stack: 'orders_total_order_amount',
                                areaStyle: {},
                                encode: {
                                    xRef: { field: 'orders_order_date_year' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                        pivotValues: [
                                            {
                                                field: 'orders_shipping_method',
                                                value: 'express',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_year',
                    'orders_shipping_method',
                    'orders_total_order_amount',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.ordersAreaYear = chart14.uuid;

    // Chart 15: Scatter chart with day dimension
    const chart15 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('scatter day'),
            name: 'scatter day',
            description: 'Daily event distribution shown as scatter chart.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_day'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'none',
                        xField: 'events_date_day',
                        yField: ['events_count'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_day',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.scatterDay = chart15.uuid;

    // Chart 16: Scatter chart with month dimension
    const chart16 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('scatter month'),
            name: 'scatter month',
            description: 'Monthly event distribution shown as scatter chart.',
            tableName: 'events',
            metricQuery: {
                exploreName: 'events',
                dimensions: ['events_event_tier', 'events_date_month'],
                metrics: ['events_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'events_event_tier',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            pivotConfig: {
                columns: ['events_event_tier'],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        stack: 'none',
                        xField: 'events_date_month',
                        yField: ['events_count'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_month' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_month' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.SCATTER,
                                encode: {
                                    xRef: { field: 'events_date_month' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'events_event_tier',
                    'events_date_month',
                    'events_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.scatterMonth = chart16.uuid;

    return chartUuids;
}

async function createDashboard(
    knex: Knex,
    chartUuids: ChartUuids,
): Promise<void> {
    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const { space_uuid: spaceUuid } = await spaceModel.getFirstAccessibleSpace(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    // Create dashboard tiles
    const tiles: CreateDashboardChartTile[] = [
        // First row
        {
            uuid: uuidv4(),
            x: 0,
            y: 0,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.dayRef,
            },
        },
        {
            uuid: uuidv4(),
            x: 12,
            y: 0,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.dayStacked,
            },
        },
        {
            uuid: uuidv4(),
            x: 24,
            y: 0,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.dayStacked100,
            },
        },
        // Second row
        {
            uuid: uuidv4(),
            x: 0,
            y: 9,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.lineChart,
            },
        },
        {
            uuid: uuidv4(),
            x: 12,
            y: 9,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.areaChart,
            },
        },
        {
            uuid: uuidv4(),
            x: 24,
            y: 9,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.areaChart100,
            },
        },
        // Third row
        {
            uuid: uuidv4(),
            x: 0,
            y: 18,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.week,
            },
        },
        {
            uuid: uuidv4(),
            x: 12,
            y: 18,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.quarter,
            },
        },
        {
            uuid: uuidv4(),
            x: 24,
            y: 18,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.month,
            },
        },
        // Fourth row
        {
            uuid: uuidv4(),
            x: 0,
            y: 27,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.visitMonth,
            },
        },
        {
            uuid: uuidv4(),
            x: 12,
            y: 27,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.visitMonth2,
            },
        },
        // Fifth row - orders area 100% with week/month/year
        {
            uuid: uuidv4(),
            x: 12,
            y: 36,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.ordersAreaMonth,
            },
        },
        {
            uuid: uuidv4(),
            x: 24,
            y: 36,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.ordersAreaYear,
            },
        },
        // Sixth row - scatter charts
        {
            uuid: uuidv4(),
            x: 0,
            y: 45,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.scatterDay,
            },
        },
        {
            uuid: uuidv4(),
            x: 12,
            y: 45,
            w: 12,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.scatterMonth,
            },
        },
    ];

    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: 'Cartesian Charts (time dimensions)',
            slug: generateSlug('Cartesian Charts (time dimensions)'),
            description: '',
            tiles,
            tabs: [],
            filters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
        SEED_PROJECT.project_uuid,
    );

    // Hardcode the dashboard UUID to match the original
    const HARDCODED_DASHBOARD_UUID = '256b2e7d-409a-440e-869b-48261aee9d9b';
    await knex.raw(
        `UPDATE dashboards SET dashboard_uuid = ? WHERE dashboard_uuid = ?`,
        [HARDCODED_DASHBOARD_UUID, dashboard.uuid],
    );
}

export async function seed(knex: Knex): Promise<void> {
    const chartUuids = await createCharts(knex);
    await createDashboard(knex, chartUuids);
}
