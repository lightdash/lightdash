import { type FilterableField } from './field';
import { type DashboardFilters } from './filter';
// eslint-disable-next-line import/no-cycle
import { type ChartKind, type SavedChartType } from './savedCharts';
// eslint-disable-next-line import/no-cycle
import { type SpaceShare } from './space';
import { type UpdatedByUser } from './user';
import { type ValidationSummary } from './validation';

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
        hideTitle?: boolean;
        url: string;
    };
};

export type DashboardChartTileProperties = {
    type: DashboardTileTypes.SAVED_CHART;
    properties: {
        title?: string;
        hideTitle?: boolean;
        savedChartUuid: string | null;
        belongsToDashboard?: boolean; // this should be required and not part of the "create" types, but we need to fix tech debt first. Open ticket https://github.com/lightdash/lightdash/issues/6450
        chartName?: string | null;
        lastVersionChartKind?: ChartKind | null;
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

export const isChartTile = (
    tile: DashboardTileBase,
): tile is DashboardChartTile => tile.type === DashboardTileTypes.SAVED_CHART;

export type CreateDashboard = {
    name: string;
    description?: string;
    tiles: Array<
        | CreateDashboardChartTile
        | CreateDashboardMarkdownTile
        | CreateDashboardLoomTile
    >;
    filters?: DashboardFilters;
    updatedByUser?: Pick<UpdatedByUser, 'userUuid'>;
    spaceUuid?: string;
};

export type DashboardTile =
    | DashboardChartTile
    | DashboardMarkdownTile
    | DashboardLoomTile;

export const isDashboardChartTileType = (
    tile: DashboardTile,
): tile is DashboardChartTile => tile.type === DashboardTileTypes.SAVED_CHART;

export type DashboardDAO = Omit<Dashboard, 'isPrivate' | 'access'>;

export type Dashboard = {
    organizationUuid: string;
    projectUuid: string;
    dashboardVersionId: number;
    uuid: string;
    name: string;
    description?: string;
    updatedAt: Date;
    tiles: Array<DashboardTile>;
    filters: DashboardFilters;
    updatedByUser?: UpdatedByUser;
    spaceUuid: string;
    spaceName: string;
    views: number;
    firstViewedAt: Date | string | null;
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    isPrivate: boolean | null;
    access: SpaceShare[] | null;
};

export type DashboardSummary = {
    dashboardSummaryUuid: string;
    dashboardUuid: string;
    dashboardVersionId: number;
    context: string | undefined;
    summary: string;
    createdAt: Date;
};

export type DashboardBasicDetails = Pick<
    Dashboard,
    | 'uuid'
    | 'name'
    | 'description'
    | 'updatedAt'
    | 'projectUuid'
    | 'updatedByUser'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'views'
    | 'firstViewedAt'
    | 'pinnedListUuid'
    | 'pinnedListOrder'
> & { validationErrors?: ValidationSummary[] };

export type SpaceDashboard = DashboardBasicDetails;

export type DashboardUnversionedFields = Pick<
    CreateDashboard,
    'name' | 'description' | 'spaceUuid'
>;

export type DashboardVersionedFields = Pick<
    CreateDashboard,
    'tiles' | 'filters' | 'updatedByUser'
>;

export type UpdateDashboardDetails = Pick<Dashboard, 'name' | 'description'>;

export type UpdateDashboard =
    | DashboardUnversionedFields
    | DashboardVersionedFields
    | (DashboardUnversionedFields & DashboardVersionedFields);

export type UpdateMultipleDashboards = Pick<
    Dashboard,
    'uuid' | 'name' | 'description' | 'spaceUuid'
>;

export type DashboardAvailableFilters = {
    savedQueryFilters: Record<string, number[]>;
    allFilterableFields: FilterableField[];
};

export type SavedChartsInfoForDashboardAvailableFilters = {
    tileUuid: DashboardChartTile['uuid'];
    savedChartUuid: NonNullable<
        DashboardChartTile['properties']['savedChartUuid']
    >;
}[];

export const isDashboardUnversionedFields = (
    data: UpdateDashboard,
): data is DashboardUnversionedFields =>
    ('name' in data && !!data.name) ||
    ('spaceUuid' in data && !!data.spaceUuid);

export const isDashboardVersionedFields = (
    data: UpdateDashboard,
): data is DashboardVersionedFields => 'tiles' in data && !!data.tiles;

export const defaultTileSize = {
    h: 9,
    w: 15,
    x: 0,
    y: 0,
};

export const getDefaultChartTileSize = (
    chartType: SavedChartType | string | undefined,
) => {
    switch (chartType) {
        case 'big_number':
            return {
                h: 6,
                w: 9,
                x: 0,
                y: 0,
            };
        default:
            return defaultTileSize;
    }
};

export const hasChartsInDashboard = (dashboard: DashboardDAO) =>
    dashboard.tiles.some(
        (tile) => isChartTile(tile) && tile.properties.belongsToDashboard,
    );
