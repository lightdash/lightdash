import {
    type CreateChartInSpace,
    type CreateDashboard,
    type CreateDashboardChartTile,
    type CreateDashboardHeadingTile,
} from '@lightdash/common';

export type PlaygroundChartDefinition = Omit<
    CreateChartInSpace,
    'spaceUuid' | 'dashboardUuid'
> & {
    key: string;
    slug: string;
};

export type PlaygroundDashboardChartTile = Omit<
    CreateDashboardChartTile,
    'properties'
> & {
    properties: Omit<
        CreateDashboardChartTile['properties'],
        'savedChartUuid'
    > & {
        chartKey: string;
    };
};

export type PlaygroundDashboardDefinition = Omit<
    CreateDashboard,
    'tiles' | 'spaceUuid' | 'updatedByUser'
> & {
    slug: string;
    tiles: Array<PlaygroundDashboardChartTile | CreateDashboardHeadingTile>;
};

export type PlaygroundContent = {
    version: 1;
    space: {
        name: string;
        path: string;
    };
    charts: PlaygroundChartDefinition[];
    dashboard: PlaygroundDashboardDefinition;
};
