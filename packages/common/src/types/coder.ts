import { z } from 'zod';
import type { PromotionChanges, SavedChart } from '..';
import {
    dashboardChartTileSchema,
    dashboardLoomTileSchema,
    dashboardMarkdownTileSchema,
    dashboardSchema,
    dashboardSemanticViewerChartTileSchema,
    dashboardSqlChartTileSchema,
    DashboardTileTypes,
} from './dashboard';

export const currentVersion = 1;
// We want to only use properties that can be modified by the user
// We'll be using slug to access these charts, so uuids are not included
// These are not linked to a project or org, so projectUuid is not included
export type ChartAsCode = Pick<
    SavedChart,
    | 'name'
    | 'description'
    | 'tableName'
    | 'metricQuery'
    | 'chartConfig'
    | 'tableConfig'
    | 'slug'
    | 'updatedAt' // Not modifiable by user, but useful to know if it has been updated
> & {
    dashboardSlug: string | undefined;
    version: number;
    spaceSlug: string; // Charts within dashboards will be pointing to spaceSlug of the dashboard by design
    downloadedAt?: Date; // Not modifiable by user, but useful to know if it has been updated
};

export type ApiChartAsCodeListResponse = {
    status: 'ok';
    results: {
        charts: ChartAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

const chartTileAsCodeSchema = dashboardChartTileSchema.extend({
    uuid: dashboardChartTileSchema.shape.uuid.optional(),
});

const markdownTileAsCodeSchema = dashboardMarkdownTileSchema.extend({
    uuid: dashboardMarkdownTileSchema.shape.uuid.optional(),
});

const sqlChartTileAsCodeSchema = dashboardSqlChartTileSchema.extend({
    uuid: dashboardSqlChartTileSchema.shape.uuid.optional(),
});

const semanticViewerChartTileAsCodeSchema =
    dashboardSemanticViewerChartTileSchema.extend({
        uuid: dashboardSemanticViewerChartTileSchema.shape.uuid.optional(),
    });

const loomTileAsCodeSchema = dashboardLoomTileSchema.extend({
    uuid: dashboardLoomTileSchema.shape.uuid.optional(),
});

export type ChartTileAsCode = z.infer<typeof chartTileAsCodeSchema>;
export type MarkdownTileAsCode = z.infer<typeof markdownTileAsCodeSchema>;
export type SqlChartTileAsCode = z.infer<typeof sqlChartTileAsCodeSchema>;
export type LoomTileAsCode = z.infer<typeof loomTileAsCodeSchema>;
export type SemanticViewerChartTileAsCode = z.infer<
    typeof semanticViewerChartTileAsCodeSchema
>;

export type DashboardTileAsCode = z.infer<typeof dashboardTileAsCodeSchema>;

const dashboardTileAsCodeSchema = z.union([
    chartTileAsCodeSchema,
    markdownTileAsCodeSchema,
    sqlChartTileAsCodeSchema,
    loomTileAsCodeSchema,
    semanticViewerChartTileAsCodeSchema,
]);

export const isVariousChartTile = (
    tile: DashboardTileAsCode,
): tile is
    | ChartTileAsCode
    | SqlChartTileAsCode
    | SemanticViewerChartTileAsCode =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART ||
    tile.type === DashboardTileTypes.SEMANTIC_VIEWER_CHART;

export const dashboardAsCodeSchema = dashboardSchema
    .pick({
        name: true,
        description: true,
        updatedAt: true,
        filters: true,
        tabs: true,
        slug: true,
    })
    .extend({
        tiles: z.array(dashboardTileAsCodeSchema),
        version: z.number(),
        spaceSlug: z.string(),
        downloadedAt: z.date().optional(),
    });

export type DashboardAsCode = z.infer<typeof dashboardAsCodeSchema>;

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: {
        dashboards: DashboardAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    };
};
export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};
