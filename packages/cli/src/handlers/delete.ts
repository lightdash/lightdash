/* eslint-disable no-await-in-loop */
import {
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ApiSqlChartAsCodeListResponse,
    assertUnreachable,
    AuthorizationError,
    DashboardAsCode,
    getErrorMessage,
} from '@lightdash/common';
import { Dirent, promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

export type DeleteHandlerOptions = {
    verbose: boolean;
    charts: string[]; // These can be slugs, uuids or urls
    dashboards: string[]; // These can be slugs, uuids or urls
    force: boolean;
    path?: string;
    project?: string;
};

type ContentInfo = {
    slug: string;
    name: string;
    type: 'chart' | 'sqlChart' | 'dashboard';
    filePath: string | null;
};

const getDownloadFolder = (customPath?: string): string => {
    if (customPath) {
        return path.isAbsolute(customPath)
            ? customPath
            : path.join(process.cwd(), customPath);
    }
    return path.join(process.cwd(), 'lightdash');
};

/**
 * Parse content filters to extract slugs or UUIDs from URLs
 */
const parseContentFilter = (item: string): string => {
    const uuidMatch = item.match(
        /https?:\/\/.+\/(?:saved|dashboards)\/([a-f0-9-]+)/i,
    );
    return uuidMatch ? uuidMatch[1] : item;
};

/**
 * Find a local file for a given content item
 */
const findLocalFile = async (
    slug: string,
    type: 'chart' | 'sqlChart' | 'dashboard',
    customPath?: string,
): Promise<string | null> => {
    const baseDir = getDownloadFolder(customPath);
    const folder = type === 'dashboard' ? 'dashboards' : 'charts';
    const extension = type === 'sqlChart' ? '.sql.yml' : '.yml';

    // Try flat structure first
    const flatPath = path.join(baseDir, folder, `${slug}${extension}`);
    try {
        await fs.access(flatPath);
        return flatPath;
    } catch {
        // Try nested structure - search recursively
        try {
            const allEntries = await fs.readdir(baseDir, {
                recursive: true,
                withFileTypes: true,
            });

            const matchingFile = allEntries.find(
                (entry: Dirent) =>
                    entry.isFile() &&
                    entry.parentPath.endsWith(path.sep + folder) &&
                    entry.name === `${slug}${extension}`,
            );

            if (matchingFile) {
                return path.join(matchingFile.parentPath, matchingFile.name);
            }
        } catch {
            // Directory doesn't exist
        }
    }
    return null;
};

/**
 * Fetch content info from the server by slug or UUID
 */
const fetchContentInfo = async (
    projectId: string,
    ids: string[],
    type: 'charts' | 'dashboards',
): Promise<ContentInfo[]> => {
    if (ids.length === 0) return [];

    const parsedIds = ids.map(parseContentFilter);
    const queryString = `?${new URLSearchParams(
        parsedIds.map((id) => ['ids', id] as [string, string]),
    ).toString()}`;

    const results: ContentInfo[] = [];

    // Fetch regular charts
    if (type === 'charts') {
        try {
            const chartResults = await lightdashApi<
                ApiChartAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/charts/code${queryString}`,
                body: undefined,
            });

            for (const chart of chartResults.charts) {
                results.push({
                    slug: chart.slug,
                    name: chart.name,
                    type: 'chart',
                    filePath: null, // Will be resolved later
                });
            }
        } catch (error) {
            GlobalState.debug(
                `Error fetching charts: ${getErrorMessage(error)}`,
            );
        }

        // Also fetch SQL charts
        try {
            const sqlChartResults = await lightdashApi<
                ApiSqlChartAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/sqlCharts/code${queryString}`,
                body: undefined,
            });

            for (const sqlChart of sqlChartResults.sqlCharts) {
                results.push({
                    slug: sqlChart.slug,
                    name: sqlChart.name,
                    type: 'sqlChart',
                    filePath: null,
                });
            }
        } catch (error) {
            GlobalState.debug(
                `Error fetching SQL charts: ${getErrorMessage(error)}`,
            );
        }
    } else {
        try {
            const dashboardResults = await lightdashApi<
                ApiDashboardAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/dashboards/code${queryString}`,
                body: undefined,
            });

            for (const dashboard of dashboardResults.dashboards) {
                results.push({
                    slug: dashboard.slug,
                    name: dashboard.name,
                    type: 'dashboard',
                    filePath: null,
                });
            }
        } catch (error) {
            GlobalState.debug(
                `Error fetching dashboards: ${getErrorMessage(error)}`,
            );
        }
    }

    return results;
};

/**
 * Delete a single piece of content from the server
 * The API endpoints accept both UUID and slug
 */
const deleteFromServer = async (
    content: ContentInfo,
    projectId: string,
): Promise<void> => {
    switch (content.type) {
        case 'chart':
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/api/v1/saved/${content.slug}`,
                body: undefined,
            });
            return;
        case 'sqlChart':
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/api/v1/projects/${projectId}/sqlRunner/saved/${content.slug}`,
                body: undefined,
            });
            return;
        case 'dashboard':
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/api/v1/dashboards/${content.slug}`,
                body: undefined,
            });
            return;
        default:
            assertUnreachable(
                content.type,
                `Unknown content type: ${content.type}`,
            );
    }
};

/**
 * Fetch all dashboards to check which ones reference the charts being deleted
 */
const findAffectedDashboards = async (
    projectId: string,
    chartSlugs: string[],
): Promise<
    Array<{ dashboardName: string; dashboardSlug: string; chartSlug: string }>
> => {
    if (chartSlugs.length === 0) return [];

    const affected: Array<{
        dashboardName: string;
        dashboardSlug: string;
        chartSlug: string;
    }> = [];

    try {
        // Fetch all dashboards to check their tiles
        let offset = 0;
        let total = 0;

        do {
            const results = await lightdashApi<
                ApiDashboardAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/dashboards/code?offset=${offset}`,
                body: undefined,
            });

            for (const dashboard of results.dashboards) {
                const referencedCharts = (dashboard as DashboardAsCode).tiles
                    .map((tile) =>
                        'chartSlug' in tile.properties
                            ? (tile.properties.chartSlug as string)
                            : undefined,
                    )
                    .filter((slug): slug is string => slug !== undefined);

                for (const chartSlug of chartSlugs) {
                    if (referencedCharts.includes(chartSlug)) {
                        affected.push({
                            dashboardName: dashboard.name,
                            dashboardSlug: dashboard.slug,
                            chartSlug,
                        });
                    }
                }
            }

            offset = results.offset;
            total = results.total;
        } while (offset < total);
    } catch (error) {
        GlobalState.debug(
            `Error checking dashboard dependencies: ${getErrorMessage(error)}`,
        );
    }

    return affected;
};

/**
 * Delete a local file
 */
const deleteLocalFile = async (filePath: string): Promise<boolean> => {
    try {
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        GlobalState.debug(
            `Error deleting file ${filePath}: ${getErrorMessage(error)}`,
        );
        return false;
    }
};

export const deleteHandler = async (
    options: DeleteHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const spinner = GlobalState.startSpinner('Preparing to delete content');

    await checkLightdashVersion();

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectId = options.project || config.context.project;
    if (!projectId) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    // Log current project info
    if (options.project) {
        console.error(
            `\n${styles.success('Deleting from project:')} ${projectId}\n`,
        );
    } else {
        GlobalState.logProjectInfo(config);
    }

    // Check that at least one chart or dashboard is specified
    if (options.charts.length === 0 && options.dashboards.length === 0) {
        spinner.fail('No charts or dashboards specified');
        console.error(
            styles.error(
                'Please specify at least one chart (-c) or dashboard (-d) to delete',
            ),
        );
        return;
    }

    const start = Date.now();

    await LightdashAnalytics.track({
        event: 'delete.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: config.user?.organizationUuid,
            projectId,
        },
    });

    try {
        // Fetch content info from server
        spinner.text = 'Fetching content from server';
        const chartInfos = await fetchContentInfo(
            projectId,
            options.charts,
            'charts',
        );
        const dashboardInfos = await fetchContentInfo(
            projectId,
            options.dashboards,
            'dashboards',
        );

        const allContent = [...chartInfos, ...dashboardInfos];

        // Check for missing content
        const foundChartSlugs = chartInfos.map((c) => c.slug);
        const foundDashboardSlugs = dashboardInfos.map((d) => d.slug);

        for (const chartId of options.charts) {
            const parsed = parseContentFilter(chartId);
            if (
                !foundChartSlugs.includes(parsed) &&
                !chartInfos.some((c) => c.slug === parsed)
            ) {
                console.warn(
                    styles.warning(`Chart not found on server: "${chartId}"`),
                );
            }
        }

        for (const dashboardId of options.dashboards) {
            const parsed = parseContentFilter(dashboardId);
            if (
                !foundDashboardSlugs.includes(parsed) &&
                !dashboardInfos.some((d) => d.slug === parsed)
            ) {
                console.warn(
                    styles.warning(
                        `Dashboard not found on server: "${dashboardId}"`,
                    ),
                );
            }
        }

        if (allContent.length === 0) {
            spinner.fail('No content found to delete');
            return;
        }

        // Find local files for each content item
        spinner.text = 'Finding local files';
        for (const content of allContent) {
            content.filePath = await findLocalFile(
                content.slug,
                content.type,
                options.path,
            );
        }

        // Check for dashboards that reference charts being deleted (only if not using --force)
        const chartSlugsToDelete = chartInfos.map((c) => c.slug);
        let affectedDashboards: Array<{
            dashboardName: string;
            dashboardSlug: string;
            chartSlug: string;
        }> = [];

        if (!options.force && chartSlugsToDelete.length > 0) {
            spinner.text = 'Checking for affected dashboards';
            affectedDashboards = await findAffectedDashboards(
                projectId,
                chartSlugsToDelete,
            );
        }

        // Show what will be deleted
        spinner.stop();
        console.info('\nContent to delete:');
        for (const content of allContent) {
            const typeLabel =
                content.type === 'sqlChart' ? 'SQL Chart' : content.type;
            const fileInfo = content.filePath
                ? ` (file: ${path.relative(process.cwd(), content.filePath)})`
                : ' (no local file)';
            console.info(
                `  - ${styles.title(typeLabel)}: ${content.name} (${
                    content.slug
                })${fileInfo}`,
            );
        }

        // Show affected dashboards warning
        if (affectedDashboards.length > 0) {
            console.info('');
            console.warn(
                styles.warning(
                    `⚠️  The following dashboards reference charts being deleted:`,
                ),
            );
            for (const affected of affectedDashboards) {
                console.warn(
                    styles.warning(
                        `  - Dashboard "${affected.dashboardName}" uses chart "${affected.chartSlug}"`,
                    ),
                );
            }
            console.warn(
                styles.warning(
                    `These dashboard tiles will break after deletion.`,
                ),
            );
        }
        console.info('');

        // Ask for confirmation if not using --force
        if (!options.force) {
            const warningText =
                affectedDashboards.length > 0
                    ? ` (${affectedDashboards.length} dashboard(s) will be affected)`
                    : '';
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'isConfirm',
                    message: `Are you sure you want to delete ${allContent.length} item(s)${warningText}? This action cannot be undone.`,
                    default: false,
                },
            ]);

            if (!answers.isConfirm) {
                console.info('Delete cancelled');
                return;
            }
        }

        // Delete content
        const deletedFromServer: ContentInfo[] = [];
        const deletedLocalFiles: string[] = [];
        const errors: Array<{ content: ContentInfo; error: string }> = [];

        for (const content of allContent) {
            const typeLabel =
                content.type === 'sqlChart' ? 'SQL Chart' : content.type;
            GlobalState.startSpinner(`Deleting ${typeLabel}: ${content.name}`);

            try {
                // Delete from server
                await deleteFromServer(content, projectId);
                deletedFromServer.push(content);

                // Delete local file if it exists
                if (content.filePath) {
                    const deleted = await deleteLocalFile(content.filePath);
                    if (deleted) {
                        deletedLocalFiles.push(content.filePath);
                    }
                }

                GlobalState.getActiveSpinner()?.succeed(
                    `Deleted ${typeLabel}: ${content.name}`,
                );
            } catch (error) {
                GlobalState.getActiveSpinner()?.fail(
                    `Failed to delete ${typeLabel}: ${content.name}`,
                );
                errors.push({
                    content,
                    error: getErrorMessage(error),
                });
                console.error(
                    styles.error(`  Error: ${getErrorMessage(error)}`),
                );
            }
        }

        // Summary
        console.info('');
        console.info(styles.success('Delete summary:'));
        console.info(`  Deleted from server: ${deletedFromServer.length}`);
        console.info(`  Local files removed: ${deletedLocalFiles.length}`);
        if (errors.length > 0) {
            console.info(styles.error(`  Errors: ${errors.length}`));
        }

        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'delete.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartInfos.length,
                dashboardsNum: dashboardInfos.length,
                deletedNum: deletedFromServer.length,
                errorsNum: errors.length,
                timeToCompleted: (end - start) / 1000,
            },
        });
    } catch (error) {
        spinner.fail(`Error deleting content`);
        console.error(styles.error(`\nError: ${getErrorMessage(error)}`));

        await LightdashAnalytics.track({
            event: 'delete.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: getErrorMessage(error),
            },
        });
    }
};
