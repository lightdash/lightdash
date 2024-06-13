import { ChartKind, ChartType } from '@lightdash/common';
import { PromotedChart, UpstreamChart } from './PromoteService';

export const promotedSpace: PromotedChart['space'] = {
    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    projectUuid: 'e1c4c2d1-e0ea-4be1-ac97-936d871efbe3',
    uuid: '1458270c-1ca2-41a2-b6a6-ae43918f74b9',
    name: 'Jaffle shop',
    isPrivate: false,
    access: ['b264d83a-9000-426a-85ec-3f9c20f368ce'],
    pinnedListUuid: null,
    pinnedListOrder: null,
    chartCount: 0,
    dashboardCount: 0,
    slug: 'jaffle-shop',
};

export const promotedChart: PromotedChart = {
    chart: {
        uuid: '596eb2e5-8214-49f6-ba98-2e4f06ef954e',
        projectUuid: 'e1c4c2d1-e0ea-4be1-ac97-936d871efbe3',
        name: 'apple chart',
        description: '',
        tableName: 'orders',
        updatedAt: new Date(),
        updatedByUser: {
            userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
            firstName: 'David',
            lastName: 'Attenborough',
        },
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        },
        chartConfig: { type: ChartType.CARTESIAN, config: undefined },
        tableConfig: { columnOrder: [] },
        organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
        spaceUuid: '1458270c-1ca2-41a2-b6a6-ae43918f74b9',
        spaceName: 'Jaffle shop',
        pinnedListUuid: null,
        pinnedListOrder: null,
        dashboardUuid: null,
        dashboardName: null,
        colorPalette: [
            '#5470c6',
            '#fc8452',
            '#91cc75',
            '#fac858',
            '#ee6666',
            '#73c0de',
            '#3ba272',
            '#9a60b4',
            '#ea7ccc',
        ],
        slug: 'apple-chart',
    },
    projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    space: promotedSpace,
    access: [],
};

export const missingUpstreamChart: UpstreamChart = {
    chart: undefined,
    projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    space: undefined,
    access: [],
};
export const existingUpstreamChart: UpstreamChart = {
    chart: {
        uuid: '034657eb-86ac-409e-b167-c20197881c54',
        name: 'apple chart',
        description: '',
        spaceUuid: '333d5d37-e533-4dbd-988c-e422d2d5c1a8',
        spaceName: 'Jaffle shop',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
        pinnedListUuid: null,
        chartKind: ChartKind.VERTICAL_BAR,
        dashboardUuid: null,
        dashboardName: null,
        // updatedAt:  new Date(),
        chartType: ChartType.CARTESIAN,
    },
    projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    space: promotedSpace,
    access: [],
};
