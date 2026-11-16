import {
    DashboardTileTypes,
    NotFoundError,
    ParameterError,
    type CreateDashboard,
    type CreateDashboardComposerChartTile,
    type DashboardComposerChartTile,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    DashboardTileComposerChartsTableName,
} from '../../database/entities/composerCharts';
import {
    DashboardsTableName,
    DashboardTilesTableName,
} from '../../database/entities/dashboards';

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
        chart_slug: string | null;
    },
): DashboardComposerChartTile => ({
    ...base,
    type: DashboardTileTypes.COMPOSER_CHART,
    properties: {
        title: row.title ?? '',
        hideTitle: row.hide_title ?? false,
        composerChartUuid: row.composer_chart_uuid,
        chartName: row.name,
        chartSlug: row.chart_slug,
    },
});

export const insertComposerChartTiles = async (
    trx: Knex.Transaction,
    dashboardId: number,
    dashboardVersionId: number,
    tiles: ReadonlyArray<CreateDashboard['tiles'][number] & { uuid: string }>,
) => {
    const composerTiles = tiles.filter(
        (tile): tile is CreateDashboardComposerChartTile & { uuid: string } =>
            tile.type === DashboardTileTypes.COMPOSER_CHART,
    );
    if (composerTiles.length === 0) return;

    const rows = composerTiles.map(({ uuid, properties }) => {
        if (!properties.composerChartUuid) {
            throw new ParameterError('Composer chart tile has no chart');
        }
        return {
            dashboard_version_id: dashboardVersionId,
            dashboard_tile_uuid: uuid,
            composer_chart_uuid: properties.composerChartUuid,
            title: properties.title ?? null,
            hide_title: properties.hideTitle ?? false,
        };
    });
    const chartUuids = [...new Set(rows.map((row) => row.composer_chart_uuid))];
    const foundUuids = await trx(ComposerChartsTableName)
        .whereIn('composer_chart_uuid', chartUuids)
        .whereNull('deleted_at')
        .whereIn(
            'dashboard_uuid',
            trx(DashboardsTableName)
                .select('dashboard_uuid')
                .where('dashboard_id', dashboardId),
        )
        .pluck('composer_chart_uuid');
    if (foundUuids.length !== chartUuids.length) {
        throw new NotFoundError(
            'Composer chart not found, or owned by another dashboard',
        );
    }
    await trx(DashboardTileComposerChartsTableName).insert(rows);
};

export const softDeleteDashboardComposerCharts = (
    db: Knex,
    dashboardUuid: string,
    deletedBy: { at: Date; userUuid: string },
) =>
    db(ComposerChartsTableName)
        .update({
            deleted_at: deletedBy.at,
            deleted_by_user_uuid: deletedBy.userUuid,
        })
        .where('dashboard_uuid', dashboardUuid)
        .whereNull('deleted_at');

export const restoreDashboardComposerCharts = (
    db: Knex,
    dashboardUuid: string,
    deletedByUserUuid: string,
) =>
    db(ComposerChartsTableName)
        .update({ deleted_at: null, deleted_by_user_uuid: null })
        .where('dashboard_uuid', dashboardUuid)
        .where('deleted_by_user_uuid', deletedByUserUuid);
