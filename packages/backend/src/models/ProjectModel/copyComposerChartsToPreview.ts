import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    ComposerChartVersionsTableName,
} from '../../database/entities/composerCharts';

/**
 * Clones each composer chart of a copied dashboard with its latest version,
 * keeping slug and author. Returns the preview chart uuid by source uuid.
 */
export const copyComposerChartsToPreview = async (
    trx: Knex.Transaction,
    previewProjectUuid: string,
    previewDashboardUuidBySource: Map<string, string>,
): Promise<Map<string, string>> => {
    const sources = await trx(ComposerChartsTableName)
        .whereIn('dashboard_uuid', [...previewDashboardUuidBySource.keys()])
        .whereNull('deleted_at')
        .select('*');
    const previewUuidBySource = new Map<string, string>();
    if (sources.length === 0) return previewUuidBySource;

    // Row by row so each copy is paired with its source without relying on RETURNING order.
    await sources.reduce(async (previous, source) => {
        await previous;
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
    }, Promise.resolve());

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
    return previewUuidBySource;
};
