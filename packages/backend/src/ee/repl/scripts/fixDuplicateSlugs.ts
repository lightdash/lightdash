import type { Knex } from 'knex';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { generateUniqueSlug } from '../../../utils/SlugUtils';

export function getFixDuplicateSlugsScripts(database: Knex) {
    async function fixDuplicateChartSlugsForProject(projectUuid: string) {
        return database.transaction(async (trx) => {
            const duplicateSlugs = await trx(SavedChartsTableName)
                .select('slug')
                .where('project_uuid', projectUuid)
                .groupBy('slug')
                .havingRaw('COUNT(*) > 1');

            console.log(
                `Fixing ${duplicateSlugs.length} duplicate slugs for project ${projectUuid}`,
            );

            for await (const slug of duplicateSlugs) {
                const chartsWithSlug = await trx(SavedChartsTableName)
                    .where('slug', slug)
                    .andWhere('project_uuid', projectUuid);

                const orderedCharts = chartsWithSlug.sort(
                    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
                );

                const [firstChart, ...restCharts] = orderedCharts;

                // This is so that the slugs are numbered correctly, first slug we pass into generateUniqueSlug will always get the highest number
                const restChartsNewestToOldest = restCharts.sort(
                    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
                );

                for await (const chart of restChartsNewestToOldest) {
                    const uniqueSlug = await generateUniqueSlug(
                        trx,
                        SavedChartsTableName,
                        chart.slug,
                    );

                    console.log(
                        `Updating chart ${chart.name} having slug ${chart.slug} to ${uniqueSlug} in project ${projectUuid}`,
                    );

                    await trx(SavedChartsTableName)
                        .where('saved_query_uuid', chart.saved_query_uuid)
                        .update({ slug: uniqueSlug });
                }
            }

            console.log('Done fixing duplicate slugs for project', projectUuid);
        });
    }

    return {
        fixDuplicateChartSlugsForProject,
    };
}
