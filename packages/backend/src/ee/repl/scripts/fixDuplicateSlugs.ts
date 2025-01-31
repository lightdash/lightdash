import type { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { SpaceTableName } from '../../../database/entities/spaces';
import { generateUniqueSlugScopedToProject } from '../../../utils/SlugUtils';

export function getFixDuplicateSlugsScripts(database: Knex) {
    async function fixDuplicateChartSlugsForProject(
        projectUuid: string,
        opts: { dryRun: boolean },
    ) {
        if (!opts || !('dryRun' in opts)) {
            throw new Error('Missing dryRun option!!');
        }

        const { dryRun } = opts;
        const dryRunMessage = dryRun ? ' (dry run)' : '';

        return database.transaction(async (trx) => {
            const queryBase = trx(SavedChartsTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${SavedChartsTableName}.dashboard_uuid`,
                )
                .innerJoin(SpaceTableName, function spaceJoin() {
                    this.on(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${DashboardsTableName}.space_id`,
                    ).orOn(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${SavedChartsTableName}.space_id`,
                    );
                })
                .innerJoin(
                    ProjectTableName,
                    `${SpaceTableName}.project_id`,
                    `${ProjectTableName}.project_id`,
                )
                .where(`${ProjectTableName}.project_uuid`, projectUuid);

            const duplicateSlugs = await queryBase
                .clone()
                .select<{ slug: string }[]>(`${SavedChartsTableName}.slug`)
                .groupBy(`${SavedChartsTableName}.slug`)
                .havingRaw('COUNT(*) > 1');

            console.info(
                `Fixing ${duplicateSlugs.length} duplicate slugs for project ${projectUuid}${dryRunMessage}`,
            );

            for await (const { slug } of duplicateSlugs) {
                const chartsWithSlugQuery = queryBase
                    .clone()
                    .select<
                        {
                            saved_query_uuid: string;
                            slug: string;
                            name: string;
                            created_at: Date;
                        }[]
                    >(
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartsTableName}.slug`,
                        `${SavedChartsTableName}.name`,
                        `${SavedChartsTableName}.created_at`,
                    )
                    .where(`${SavedChartsTableName}.slug`, slug)
                    .orderBy(`${SavedChartsTableName}.created_at`, 'asc');

                const chartsWithSlug = await chartsWithSlugQuery;

                if (chartsWithSlug.length > 1) {
                    const [firstChart, ...restCharts] = chartsWithSlug;

                    for await (const chart of restCharts) {
                        const uniqueSlug =
                            await generateUniqueSlugScopedToProject(
                                trx,
                                projectUuid,
                                SavedChartsTableName,
                                chart.slug,
                            );

                        console.info(
                            `Updating chart ${chart.name} having slug ${chart.slug} to ${uniqueSlug} in project ${projectUuid}${dryRunMessage}`,
                        );

                        await trx(SavedChartsTableName)
                            .where('saved_query_uuid', chart.saved_query_uuid)
                            .update({ slug: uniqueSlug });
                    }
                }
            }

            if (dryRun) {
                // Rollback the transaction if it's a dry run, this is because slugs depend on updated charts
                await trx.rollback();
            }

            console.info(
                `Done fixing duplicate slugs for project ${projectUuid}${dryRunMessage}`,
            );
        });
    }

    return {
        fixDuplicateChartSlugsForProject,
    };
}
