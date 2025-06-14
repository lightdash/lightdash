import { stringify } from 'csv-stringify/sync';
import type { Knex } from 'knex';
import { ClientRepository } from '../../../clients/ClientRepository';
import { DashboardsTableName } from '../../../database/entities/dashboards';
import { ProjectTableName } from '../../../database/entities/projects';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { SpaceTableName } from '../../../database/entities/spaces';
import { generateUniqueSlugScopedToProject } from '../../../utils/SlugUtils';

export function getFixDuplicateSlugsScripts(
    database: Knex,
    clients: ClientRepository,
) {
    async function fixDuplicateChartSlugs(opts: {
        dryRun: boolean;
        projectUuid?: string;
        emailReportTo?: string | string[];
    }) {
        if (!opts || !('dryRun' in opts)) {
            throw new Error('Missing dryRun option!!');
        }

        const { dryRun } = opts;
        const dryRunMessage = dryRun ? ' (dry run)' : '';
        const projectMessage = opts.projectUuid
            ? ` project ${opts.projectUuid}`
            : ' all projects';

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
                );

            if (opts.projectUuid) {
                void queryBase.where(
                    `${ProjectTableName}.project_uuid`,
                    opts.projectUuid,
                );
            }

            const duplicateSlugs = await queryBase
                .clone()
                .select<{ slug: string; projectUuid: string }[]>({
                    slug: `${SavedChartsTableName}.slug`,
                    projectUuid: `${ProjectTableName}.project_uuid`,
                })
                .groupBy(
                    `${SavedChartsTableName}.slug`,
                    `${ProjectTableName}.project_uuid`,
                )
                .havingRaw('COUNT(*) > 1')
                .orderBy([
                    {
                        column: `${ProjectTableName}.project_uuid`,
                        order: 'asc',
                    },
                    { column: `${SavedChartsTableName}.slug`, order: 'asc' },
                ]);

            console.info(
                `Found ${duplicateSlugs.length} duplicate slugs on${projectMessage}${dryRunMessage}`,
            );
            const changeLogs: Array<{
                project_uuid: string;
                chart_uuid: string;
                original_slug: string;
                new_slug: string;
                action: 'keep' | 'update';
            }> = [];
            for await (const { slug, projectUuid } of duplicateSlugs) {
                const chartsWithSlug = await queryBase
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
                    .andWhere(`${ProjectTableName}.project_uuid`, projectUuid)
                    .orderBy([
                        {
                            column: `${ProjectTableName}.project_uuid`,
                            order: 'asc',
                        },
                        {
                            column: `${SavedChartsTableName}.slug`,
                            order: 'asc',
                        },
                        {
                            column: `${SavedChartsTableName}.created_at`,
                            order: 'asc',
                        },
                    ]);

                if (chartsWithSlug.length > 1) {
                    const [firstChart, ...restCharts] = chartsWithSlug;

                    changeLogs.push({
                        project_uuid: projectUuid,
                        chart_uuid: firstChart.saved_query_uuid,
                        original_slug: firstChart.slug,
                        new_slug: firstChart.slug,
                        action: 'keep',
                    });

                    for await (const chart of restCharts) {
                        const uniqueSlug =
                            await generateUniqueSlugScopedToProject(
                                trx,
                                projectUuid,
                                SavedChartsTableName,
                                chart.slug,
                            );

                        changeLogs.push({
                            project_uuid: projectUuid,
                            chart_uuid: chart.saved_query_uuid,
                            original_slug: chart.slug,
                            new_slug: uniqueSlug,
                            action: 'update',
                        });

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
            console.table(changeLogs);
            console.info(
                `Done fixing duplicate slugs for${projectMessage}${dryRunMessage}`,
            );

            // Send email notification if email is provided
            if (opts.emailReportTo && changeLogs.length > 0) {
                if (clients.getEmailClient().canSendEmail()) {
                    // Create CSV content using csv-stringify
                    const tableHeaders = [
                        'Project UUID',
                        'Chart UUID',
                        'Original Slug',
                        'New Slug',
                        'Action',
                    ];

                    const csvContent = stringify([
                        tableHeaders,
                        ...changeLogs.map((log) => [
                            log.project_uuid,
                            log.chart_uuid,
                            log.original_slug,
                            log.new_slug,
                            log.action,
                        ]),
                    ]);

                    const timestamp = new Date()
                        .toISOString()
                        .replace(/[:.]/g, '-');
                    const csvFilename = `chart-slug-updates-${timestamp}.csv`;

                    const subject = `Chart slug updates for${projectMessage}${dryRunMessage}`;
                    const title = `Chart slug updates for${projectMessage}${dryRunMessage}`;
                    const message = `The following chart slugs have been ${
                        dryRun ? 'identified for update' : 'updated'
                    }. Please see the attached CSV file for details.`;

                    // Convert emailReportTo to array if it's a string
                    const recipients = Array.isArray(opts.emailReportTo)
                        ? opts.emailReportTo
                        : [opts.emailReportTo];

                    // Create attachment with content directly as string
                    const attachment = {
                        filename: csvFilename,
                        content: csvContent,
                        contentType: 'text/csv',
                    };

                    await clients
                        .getEmailClient()
                        .sendGenericNotificationEmail(
                            recipients,
                            subject,
                            title,
                            message,
                            [attachment],
                        );

                    console.info(
                        `Email notification with CSV attachment sent to ${recipients.join(
                            ', ',
                        )}`,
                    );
                } else {
                    console.warn(
                        `Email client is not configured, skipping email notification`,
                    );
                }
            }
        });
    }

    async function fixDuplicateDashboardSlugs(opts: { dryRun: boolean }) {
        if (!opts || !('dryRun' in opts)) {
            throw new Error('Missing dryRun option!!');
        }

        const { dryRun } = opts;
        const dryRunMessage = dryRun ? ' (dry run)' : '';

        return database.transaction(async (trx) => {
            const queryBase = trx(DashboardsTableName)
                .innerJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
                .innerJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                );

            const duplicateSlugs = await queryBase
                .clone()
                .select<{ slug: string; projectUuid: string }[]>({
                    slug: `${DashboardsTableName}.slug`,
                    projectUuid: `${ProjectTableName}.project_uuid`,
                })
                .groupBy(
                    `${DashboardsTableName}.slug`,
                    `${ProjectTableName}.project_uuid`,
                )
                .havingRaw('COUNT(*) > 1');

            console.info(
                `Found ${duplicateSlugs.length} duplicate slugs across all projects${dryRunMessage}`,
            );

            for await (const { slug, projectUuid } of duplicateSlugs) {
                const dashboardsWithSlug = await queryBase
                    .clone()
                    .select<
                        {
                            dashboard_uuid: string;
                            slug: string;
                            name: string;
                            created_at: Date;
                        }[]
                    >(
                        `${DashboardsTableName}.dashboard_uuid`,
                        `${DashboardsTableName}.slug`,
                        `${DashboardsTableName}.name`,
                        `${DashboardsTableName}.created_at`,
                    )
                    .where(`${DashboardsTableName}.slug`, slug)
                    .andWhere(`${ProjectTableName}.project_uuid`, projectUuid)
                    .orderBy(`${DashboardsTableName}.created_at`, 'asc');

                if (dashboardsWithSlug.length > 1) {
                    const [firstDashboard, ...restDashboards] =
                        dashboardsWithSlug;

                    console.info(
                        `Keeping original slug "${firstDashboard.slug}" for dashboard "${firstDashboard.name}" (${firstDashboard.dashboard_uuid}) in project ${projectUuid}${dryRunMessage}`,
                    );

                    for await (const dashboard of restDashboards) {
                        const uniqueSlug =
                            await generateUniqueSlugScopedToProject(
                                trx,
                                projectUuid,
                                DashboardsTableName,
                                dashboard.slug,
                            );

                        console.info(
                            `Updating slug from "${dashboard.slug}" to "${uniqueSlug}" for dashboard "${dashboard.name}" (${dashboard.dashboard_uuid}) in project ${projectUuid}${dryRunMessage}`,
                        );

                        await trx(DashboardsTableName)
                            .where('dashboard_uuid', dashboard.dashboard_uuid)
                            .update({ slug: uniqueSlug });
                    }
                }
            }

            if (dryRun) {
                // Rollback the transaction if it's a dry run, this is because slugs depend on updated dashboards
                await trx.rollback();
            }

            console.info(
                `Done fixing duplicate slugs for all projects${dryRunMessage}`,
            );
        });
    }

    return {
        fixDuplicateChartSlugs,
        fixDuplicateDashboardSlugs,
    };
}
