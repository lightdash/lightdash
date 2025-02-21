import { z } from 'zod';
import { type FilterableDimension } from './field';
import { type DashboardFilters } from './filter';
import { ChartKind, type SavedChartType } from './savedCharts';
import { type SpaceShare } from './space';
import { type UpdatedByUser } from './user';
import { type ValidationSummary } from './validation';

export enum DashboardTileTypes {
    SAVED_CHART = 'saved_chart',
    SQL_CHART = 'sql_chart',
    SEMANTIC_VIEWER_CHART = 'semantic_viewer_chart',
    MARKDOWN = 'markdown',
    LOOM = 'loom',
}

export const createDashboardTileBaseSchema = z.object({
    uuid: z.string().optional(),
    type: z.nativeEnum(DashboardTileTypes),
    x: z.number(),
    y: z.number(),
    h: z.number(),
    w: z.number(),
    tabUuid: z.union([z.string(), z.undefined()]),
});

const createDashboardTileBaseSchemaWithoutTabUuid =
    createDashboardTileBaseSchema.omit({ tabUuid: true });

export type CreateDashboardTileBase = z.infer<
    typeof createDashboardTileBaseSchemaWithoutTabUuid
> & { tabUuid: string | undefined };

export const dashboardTileBaseSchema = createDashboardTileBaseSchema.extend({
    uuid: z.string(),
});

const dashboardTileBaseSchemaWithoutTabUuid =
    createDashboardTileBaseSchema.omit({ tabUuid: true });

export type DashboardTileBase = z.infer<
    typeof dashboardTileBaseSchemaWithoutTabUuid
> & {
    tabUuid: string | undefined;
};

export const dashboardMarkdownTilePropertiesSchema = z.object({
    title: z.string().describe('@i18n'),
    content: z.string().describe('@i18n'),
});

export const dashboardLoomTilePropertiesSchema = z.object({
    title: z.string().describe('@i18n'),
    hideTitle: z.boolean().optional(),
    url: z.string().describe('@i18n'),
});

export const dashboardChartTilePropertiesSchema = z.object({
    title: z.string().describe('@i18n').optional(),
    hideTitle: z.boolean().optional(),
    savedChartUuid: z.string().nullable(),
    belongsToDashboard: z.boolean().optional(),
    chartName: z.string().nullable().optional(),
    lastVersionChartKind: z.nativeEnum(ChartKind).nullable().optional(),
    chartSlug: z.string().optional(),
});

export const dashboardSqlChartTilePropertiesSchema = z.object({
    title: z.string().describe('@i18n').optional(),
    savedSqlUuid: z.string().nullable(),
    chartName: z.string(),
    hideTitle: z.boolean().optional(),
    chartSlug: z.string().optional(),
});

export const dashboardSemanticViewerChartTilePropertiesSchema = z.object({
    title: z.string().describe('@i18n').optional(),
    savedSemanticViewerChartUuid: z.string().nullable(),
    chartName: z.string(),
    hideTitle: z.boolean().optional(),
    chartSlug: z.string().optional(),
});

export type DashboardMarkdownTileProperties = z.infer<
    typeof dashboardMarkdownTilePropertiesSchema
>;
export type DashboardLoomTileProperties = z.infer<
    typeof dashboardLoomTilePropertiesSchema
>;
export type DashboardChartTileProperties = z.infer<
    typeof dashboardChartTilePropertiesSchema
>;
export type DashboardSqlChartTileProperties = z.infer<
    typeof dashboardSqlChartTilePropertiesSchema
>;
export type DashboardSemanticViewerChartTileProperties = z.infer<
    typeof dashboardSemanticViewerChartTilePropertiesSchema
>;

export const dashboardMarkdownTileSchema = dashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.MARKDOWN),
    properties: dashboardMarkdownTilePropertiesSchema,
});
export const dashboardLoomTileSchema = dashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.LOOM),
    properties: dashboardLoomTilePropertiesSchema,
});
export const dashboardChartTileSchema = dashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.SAVED_CHART),
    properties: dashboardChartTilePropertiesSchema,
});
export const dashboardSqlChartTileSchema = dashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.SQL_CHART),
    properties: dashboardSqlChartTilePropertiesSchema,
});
export const dashboardSemanticViewerChartTileSchema =
    dashboardTileBaseSchema.extend({
        type: z.literal(DashboardTileTypes.SEMANTIC_VIEWER_CHART),
        properties: dashboardSemanticViewerChartTilePropertiesSchema,
    });

export type DashboardMarkdownTile = z.infer<typeof dashboardMarkdownTileSchema>;
export type DashboardLoomTile = z.infer<typeof dashboardLoomTileSchema>;
export type DashboardChartTile = z.infer<typeof dashboardChartTileSchema>;
export type DashboardSqlChartTile = z.infer<typeof dashboardSqlChartTileSchema>;
export type DashboardSemanticViewerChartTile = z.infer<
    typeof dashboardSemanticViewerChartTileSchema
>;

const createDashboardMarkdownTileSchema = createDashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.MARKDOWN),
    properties: dashboardMarkdownTilePropertiesSchema,
});
const createDashboardLoomTileSchema = createDashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.LOOM),
    properties: dashboardLoomTilePropertiesSchema,
});
const createDashboardChartTileSchema = createDashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.SAVED_CHART),
    properties: dashboardChartTilePropertiesSchema,
});
const createDashboardSqlChartTileSchema = createDashboardTileBaseSchema.extend({
    type: z.literal(DashboardTileTypes.SQL_CHART),
    properties: dashboardSqlChartTilePropertiesSchema,
});
const createDashboardSemanticViewerChartTileSchema =
    createDashboardTileBaseSchema.extend({
        type: z.literal(DashboardTileTypes.SEMANTIC_VIEWER_CHART),
        properties: dashboardSemanticViewerChartTilePropertiesSchema,
    });

export type CreateDashboardMarkdownTile = z.infer<
    typeof createDashboardMarkdownTileSchema
>;
export type CreateDashboardLoomTile = z.infer<
    typeof createDashboardLoomTileSchema
>;
export type CreateDashboardChartTile = z.infer<
    typeof createDashboardChartTileSchema
>;
export type CreateDashboardSqlChartTile = z.infer<
    typeof createDashboardSqlChartTileSchema
>;
export type CreateDashboardSemanticViewerChartTile = z.infer<
    typeof createDashboardSemanticViewerChartTileSchema
>;

export const isChartTile = (tile: DashboardTile): tile is DashboardChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART;

export type CreateDashboard = {
    name: string;
    description?: string;
    tiles: Array<
        | CreateDashboardChartTile
        | CreateDashboardMarkdownTile
        | CreateDashboardLoomTile
        | CreateDashboardSqlChartTile
        | CreateDashboardSemanticViewerChartTile
    >;
    filters?: DashboardFilters;
    updatedByUser?: Pick<UpdatedByUser, 'userUuid'>;
    spaceUuid?: string;
    tabs: DashboardTab[];
    config?: DashboardConfig;
};

export const dashboardTileSchema = z.union([
    dashboardChartTileSchema,
    dashboardMarkdownTileSchema,
    dashboardLoomTileSchema,
    dashboardSqlChartTileSchema,
    dashboardSemanticViewerChartTileSchema,
]);

export type DashboardTile = z.infer<typeof dashboardTileSchema>;

export const isDashboardChartTileType = (
    tile: DashboardTile,
): tile is DashboardChartTile => tile.type === DashboardTileTypes.SAVED_CHART;

export const isDashboardMarkdownTileType = (
    tile: DashboardTile,
): tile is DashboardMarkdownTile => tile.type === DashboardTileTypes.MARKDOWN;

export const isDashboardLoomTileType = (
    tile: DashboardTile,
): tile is DashboardLoomTile => tile.type === DashboardTileTypes.LOOM;

export const isDashboardSqlChartTile = (
    tile: DashboardTile,
): tile is DashboardSqlChartTile => tile.type === DashboardTileTypes.SQL_CHART;

export const isDashboardSemanticViewerChartTile = (
    tile: DashboardTile,
): tile is DashboardSemanticViewerChartTile =>
    tile.type === DashboardTileTypes.SEMANTIC_VIEWER_CHART;

const dashboardTabSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    order: z.number(),
});

export type DashboardTab = z.infer<typeof dashboardTabSchema>;

export type DashboardTabWithUrls = DashboardTab & {
    nextUrl: string | null;
    prevUrl: string | null;
    selfUrl: string;
};

export type DashboardDAO = Omit<Dashboard, 'isPrivate' | 'access'>;

export type DashboardConfig = {
    isDateZoomDisabled: boolean;
};

export const dashboardSchema = z.object({
    name: z.string().describe('@i18n'),
    description: z.string().describe('@i18n').optional(),
    tiles: z.array(dashboardTileSchema),
    updatedAt: z.date(),
    slug: z.string(),
    tabs: z.array(dashboardTabSchema),
    filters: z.any(),
});

export type Dashboard = z.infer<typeof dashboardSchema> & {
    organizationUuid: string;
    projectUuid: string;
    dashboardVersionId: number;
    uuid: string;
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
    config?: DashboardConfig;
};

export enum DashboardSummaryTone {
    FRIENDLY = 'friendly',
    FORMAL = 'formal',
    DIRECT = 'direct',
    ENTHUSIASTIC = 'enthusiastic',
}

export type DashboardSummary = {
    dashboardSummaryUuid: string;
    dashboardUuid: string;
    dashboardVersionId: number;
    context?: string | null;
    tone: DashboardSummaryTone;
    audiences: string[];
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

export type DashboardBasicDetailsWithTileTypes = DashboardBasicDetails & {
    tileTypes: DashboardTileTypes[];
};

export type SpaceDashboard = DashboardBasicDetails;

export type DashboardUnversionedFields = Pick<
    CreateDashboard,
    'name' | 'description' | 'spaceUuid'
>;

export type DashboardVersionedFields = Pick<
    CreateDashboard,
    'tiles' | 'filters' | 'updatedByUser' | 'tabs' | 'config'
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
    allFilterableFields: FilterableDimension[];
};

export type SavedChartsInfoForDashboardAvailableFilters = {
    tileUuid: string;
    savedChartUuid: string;
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

export type ApiGetDashboardsResponse = {
    status: 'ok';
    results: DashboardBasicDetailsWithTileTypes[];
};

export type ApiCreateDashboardResponse = {
    status: 'ok';
    results: Dashboard;
};

export type ApiUpdateDashboardsResponse = {
    status: 'ok';
    results: Dashboard[];
};

export type DuplicateDashboardParams = {
    dashboardName: string;
    dashboardDesc: string;
};

export function isDuplicateDashboardParams(
    params: DuplicateDashboardParams | CreateDashboard,
): params is DuplicateDashboardParams {
    return 'dashboardName' in params && 'dashboardDesc' in params;
}
