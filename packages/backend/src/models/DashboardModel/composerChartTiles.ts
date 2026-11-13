import {
    DashboardTileTypes,
    type CreateDashboard,
    type CreateDashboardComposerChartTile,
    type DashboardComposerChartTile,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    DashboardTileComposerChartsTableName,
} from '../../database/entities/composerCharts';
import { DashboardTilesTableName } from '../../database/entities/dashboards';

export function onComposerChartTile(this: Knex.JoinClause) {
    this.on(
        `${DashboardTileComposerChartsTableName}.dashboard_tile_uuid`,
        '=',
        `${DashboardTilesTableName}.dashboard_tile_uuid`,
    ).andOn(
        `${DashboardTileComposerChartsTableName}.dashboard_version_id`,
        '=',
        `${DashboardTilesTableName}.dashboard_version_id`,
    );
}

export function onNonDeletedComposerChart(this: Knex.JoinClause) {
    this.on(
        `${DashboardTileComposerChartsTableName}.composer_chart_uuid`,
        '=',
        `${ComposerChartsTableName}.composer_chart_uuid`,
    ).andOnNull(`${ComposerChartsTableName}.deleted_at`);
}

export const toComposerChartTile = (
    base: Omit<DashboardComposerChartTile, 'type' | 'properties'>,
    row: {
        title: string | null;
        hide_title: boolean | null;
        composer_chart_uuid: string | null;
        name: string | null;
    },
): DashboardComposerChartTile => ({
    ...base,
    type: DashboardTileTypes.COMPOSER_CHART,
    properties: {
        title: row.title ?? '',
        hideTitle: row.hide_title ?? false,
        composerChartUuid: row.composer_chart_uuid,
        chartName: row.name,
    },
});

export const insertComposerChartTiles = async (
    trx: Knex.Transaction,
    dashboardVersionId: number,
    tiles: ReadonlyArray<CreateDashboard['tiles'][number] & { uuid: string }>,
) => {
    const rows = tiles
        .filter(
            (
                tile,
            ): tile is CreateDashboardComposerChartTile & { uuid: string } =>
                tile.type === DashboardTileTypes.COMPOSER_CHART,
        )
        .flatMap(({ uuid, properties }) =>
            properties.composerChartUuid
                ? [
                      {
                          dashboard_version_id: dashboardVersionId,
                          dashboard_tile_uuid: uuid,
                          composer_chart_uuid: properties.composerChartUuid,
                          title: properties.title ?? null,
                          hide_title: properties.hideTitle ?? false,
                      },
                  ]
                : [],
        );
    if (rows.length > 0) {
        await trx(DashboardTileComposerChartsTableName).insert(rows);
    }
};
