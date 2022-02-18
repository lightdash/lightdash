import { DashboardFilters } from './filter';
import { DBChartTypes } from './savedCharts';

export enum DashboardTileTypes {
    SAVED_CHART = 'saved_chart',
    MARKDOWN = 'markdown',
    LOOM = 'loom',
}

type CreateDashboardTileBase = {
    uuid?: string;
    type: DashboardTileTypes;
    x: number;
    y: number;
    h: number;
    w: number;
};

type DashboardTileBase = Required<CreateDashboardTileBase>;

export type DashboardMarkdownTileProperties = {
    type: DashboardTileTypes.MARKDOWN;
    properties: {
        title: string;
        content: string;
    };
};

export type DashboardLoomTileProperties = {
    type: DashboardTileTypes.LOOM;
    properties: {
        title: string;
        url: string;
    };
};

type DashboardChartTileProperties = {
    type: DashboardTileTypes.SAVED_CHART;
    properties: {
        savedChartUuid: string | null;
    };
};

export type CreateDashboardMarkdownTile = CreateDashboardTileBase &
    DashboardMarkdownTileProperties;
export type DashboardMarkdownTile = DashboardTileBase &
    DashboardMarkdownTileProperties;

export type CreateDashboardLoomTile = CreateDashboardTileBase &
    DashboardLoomTileProperties;
export type DashboardLoomTile = DashboardTileBase & DashboardLoomTileProperties;

export type CreateDashboardChartTile = CreateDashboardTileBase &
    DashboardChartTileProperties;
export type DashboardChartTile = DashboardTileBase &
    DashboardChartTileProperties;

export type CreateDashboard = {
    name: string;
    description?: string;
    tiles: Array<
        | CreateDashboardChartTile
        | CreateDashboardMarkdownTile
        | CreateDashboardLoomTile
    >;
    filters?: DashboardFilters;
};

export type Dashboard = {
    uuid: string;
    name: string;
    description?: string;
    updatedAt: Date;
    tiles: Array<
        DashboardChartTile | DashboardMarkdownTile | DashboardLoomTile
    >;
    filters: DashboardFilters;
};

export type DashboardBasicDetails = Pick<
    Dashboard,
    'uuid' | 'name' | 'description' | 'updatedAt'
>;

export type DashboardUnversionedFields = Pick<
    CreateDashboard,
    'name' | 'description'
>;
export type DashboardVersionedFields = Pick<
    CreateDashboard,
    'tiles' | 'filters'
>;

export type UpdateDashboard =
    | DashboardUnversionedFields
    | DashboardVersionedFields
    | (DashboardUnversionedFields & DashboardVersionedFields);

export const isDashboardUnversionedFields = (
    data: UpdateDashboard,
): data is DashboardUnversionedFields => 'name' in data && !!data.name;

export const isDashboardVersionedFields = (
    data: UpdateDashboard,
): data is DashboardVersionedFields => 'tiles' in data && !!data.tiles;

export const defaultTileSize = {
    h: 3,
    w: 5,
    x: 0,
    y: 0,
};

export const getDefaultChartTileSize = (
    chartType: DBChartTypes | undefined,
) => {
    switch (chartType) {
        case DBChartTypes.BIG_NUMBER:
            return {
                h: 2,
                w: 3,
                x: 0,
                y: 0,
            };
        default:
            return defaultTileSize;
    }
};
