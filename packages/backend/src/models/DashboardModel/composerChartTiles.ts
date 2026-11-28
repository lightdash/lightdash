import {
    DashboardTileTypes,
    NotFoundError,
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
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { SpaceTableName } from '../../database/entities/spaces';

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

    const rows = composerTiles.map(({ uuid, properties }) => ({
        dashboard_version_id: dashboardVersionId,
        dashboard_tile_uuid: uuid,
        // Null: a tile whose chart was permanently deleted
        composer_chart_uuid: properties.composerChartUuid ?? null,
        title: properties.title ?? null,
        hide_title: properties.hideTitle ?? false,
    }));
    const chartUuids = [
        ...new Set(rows.flatMap((row) => row.composer_chart_uuid ?? [])),
    ];
    if (chartUuids.length > 0) {
        const dashboardSpaceId = trx(DashboardsTableName)
            .select('space_id')
            .where('dashboard_id', dashboardId);
        const liveSpacesInProject = trx(SpaceTableName)
            .select('space_uuid')
            .whereNull('deleted_at')
            .where(
                'project_id',
                trx(SpaceTableName)
                    .select('project_id')
                    .where('space_id', dashboardSpaceId),
            );
        const liveUuids = new Set(
            await trx(ComposerChartsTableName)
                .whereIn('composer_chart_uuid', chartUuids)
                .whereNull('deleted_at')
                .where((owner) =>
                    owner
                        .whereIn(
                            'dashboard_uuid',
                            trx(DashboardsTableName)
                                .select('dashboard_uuid')
                                .where('dashboard_id', dashboardId),
                        )
                        .orWhereIn('space_uuid', liveSpacesInProject),
                )
                .pluck('composer_chart_uuid'),
        );
        // A tile keeps a trashed chart it already showed, so the chart's restore brings it back
        const kept = rows.flatMap(
            ({
                dashboard_tile_uuid: tileUuid,
                composer_chart_uuid: chartUuid,
            }) =>
                chartUuid && !liveUuids.has(chartUuid)
                    ? [[tileUuid, chartUuid]]
                    : [],
        );
        const shown =
            kept.length === 0
                ? []
                : await trx(DashboardTileComposerChartsTableName)
                      .innerJoin(
                          DashboardVersionsTableName,
                          `${DashboardVersionsTableName}.dashboard_version_id`,
                          `${DashboardTileComposerChartsTableName}.dashboard_version_id`,
                      )
                      .where(
                          `${DashboardVersionsTableName}.dashboard_id`,
                          dashboardId,
                      )
                      .whereIn(
                          [
                              `${DashboardTileComposerChartsTableName}.dashboard_tile_uuid`,
                              `${DashboardTileComposerChartsTableName}.composer_chart_uuid`,
                          ],
                          kept,
                      )
                      .distinct(
                          `${DashboardTileComposerChartsTableName}.dashboard_tile_uuid`,
                      );
        if (shown.length !== kept.length) {
            throw new NotFoundError(
                'Composer chart not found, or owned by another dashboard',
            );
        }
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
