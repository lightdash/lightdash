import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    ComposerChartVersionsTableName,
    DashboardTileComposerChartsTableName,
} from '../../database/entities/composerCharts';

/** Clones the composer charts of copied dashboards, their latest versions and tile rows. */
export const copyComposerChartsToPreview = async (
    trx: Knex.Transaction,
    previewProjectUuid: string,
    previewDashboardUuidBySource: Map<string, string>,
    previewDashboardVersionIdBySource: Map<number, number>,
): Promise<void> => {
    const sources = await trx(ComposerChartsTableName)
        .whereIn('dashboard_uuid', [...previewDashboardUuidBySource.keys()])
        .whereNull('deleted_at')
        .select('*');
    if (sources.length === 0) return;

    // Row by row so each copy is paired with its source without relying on RETURNING order.
    const previewUuidBySource = new Map<string, string>();
    for (const source of sources) {
        // eslint-disable-next-line no-await-in-loop
        const [{ composer_chart_uuid: previewUuid }] = await trx(
            ComposerChartsTableName,
        )
            .insert({
                project_uuid: previewProjectUuid,
                dashboard_uuid: previewDashboardUuidBySource.get(
                    source.dashboard_uuid!,
                )!,
                name: source.name,
                description: source.description,
                slug: source.slug,
                created_at: source.created_at,
                created_by_user_uuid: source.created_by_user_uuid,
            })
            .returning('composer_chart_uuid');
        previewUuidBySource.set(source.composer_chart_uuid, previewUuid);
    }

    const latestVersions = await trx(ComposerChartVersionsTableName)
        .distinctOn('composer_chart_uuid')
        .whereIn('composer_chart_uuid', [...previewUuidBySource.keys()])
        .orderBy([
            { column: 'composer_chart_uuid' },
            { column: 'created_at', order: 'desc' },
        ])
        .select('*');
    await trx(ComposerChartVersionsTableName).insert(
        latestVersions.map((version) => ({
            composer_chart_uuid: previewUuidBySource.get(
                version.composer_chart_uuid,
            )!,
            pipeline: JSON.stringify(version.pipeline),
            chart: JSON.stringify(version.chart),
            created_at: version.created_at,
            created_by_user_uuid: version.created_by_user_uuid,
        })),
    );

    // A tile row of a deleted chart has no copy to point at
    const tiles = await trx(DashboardTileComposerChartsTableName)
        .whereIn('dashboard_version_id', [
            ...previewDashboardVersionIdBySource.keys(),
        ])
        .whereIn('composer_chart_uuid', [...previewUuidBySource.keys()])
        .select('*');
    if (tiles.length === 0) return;
    await trx(DashboardTileComposerChartsTableName).insert(
        tiles.map((tile) => ({
            ...tile,
            dashboard_version_id: previewDashboardVersionIdBySource.get(
                tile.dashboard_version_id,
            )!,
            composer_chart_uuid: previewUuidBySource.get(
                tile.composer_chart_uuid,
            )!,
        })),
    );
};
