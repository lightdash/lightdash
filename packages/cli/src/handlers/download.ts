/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiDashboardAsCodeListResponse,
    ApiSqlChartAsCodeListResponse,
    assertUnreachable,
    AuthorizationError,
    ChartAsCode,
    DashboardAsCode,
    generateSlug,
    getErrorMessage,
    LightdashError,
    Project,
    PromotionAction,
    PromotionChanges,
    SqlChartAsCode,
} from '@lightdash/common';
import { Dirent, promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

export type DownloadHandlerOptions = {
    verbose: boolean;
    charts: string[]; // These can be slugs, uuids or urls
    dashboards: string[]; // These can be slugs, uuids or urls
    force: boolean;
    path?: string; // New optional path parameter
    project?: string;
    languageMap: boolean;
    skipSpaceCreate: boolean;
    public: boolean;
    includeCharts: boolean;
    nested: boolean; // Use nested folder structure (projectName/spaceSlug/charts|dashboards)
};

type FolderScheme = 'flat' | 'nested';

const getDownloadFolder = (customPath?: string): string => {
    if (customPath) {
        return path.isAbsolute(customPath)
            ? customPath
            : path.join(process.cwd(), customPath);
    }
    return path.join(process.cwd(), 'lightdash');
};

/*
    This function is used to parse the content filters.
    It can be slugs, uuids or urls
    We remove the URL part (if any) and return a list of `slugs or uuids` that can be used in the API call
*/
const parseContentFilters = (items: string[]): string => {
    if (items.length === 0) return '';

    const parsedItems = items.map((item) => {
        const uuidMatch = item.match(
            /https?:\/\/.+\/(?:saved|dashboards)\/([a-f0-9-]+)/i,
        );
        return uuidMatch ? uuidMatch[1] : item;
    });

    return `?${new URLSearchParams(
        parsedItems.map((item) => ['ids', item] as [string, string]),
    ).toString()}`;
};

// TODO: translations should be partials of ChartAsCode and DashboardAsCode
type ContentAsCodeType =
    | {
          type: 'chart';
          content: ChartAsCode;
          translationMap: object | undefined;
      }
    | {
          type: 'sqlChart';
          content: SqlChartAsCode;
          translationMap: object | undefined;
      }
    | {
          type: 'dashboard';
          content: DashboardAsCode;
          translationMap: object | undefined;
      };

const createDirForContent = async (
    projectName: string,
    spaceSlug: string,
    folder: 'charts' | 'dashboards',
    customPath: string | undefined,
    folderScheme: FolderScheme,
) => {
    const baseDir = getDownloadFolder(customPath);

    let outputDir: string;
    if (folderScheme === 'flat') {
        // Flat scheme: baseDir/folder
        outputDir = path.join(baseDir, folder);
    } else {
        // Nested scheme: baseDir/projectName/spaceSlug/folder
        outputDir = path.join(baseDir, projectName, spaceSlug, folder);
    }

    GlobalState.debug(`Creating directory: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });

    return outputDir;
};

/**
 * Get file extension for content-as-code files.
 * SQL charts use '.sql.yml' extension to avoid filename conflicts with regular charts
 * that may have the same slug, since both chart types share the same output directory.
 */
const getFileExtension = (contentType: ContentAsCodeType['type']): string => {
    switch (contentType) {
        case 'sqlChart':
            return '.sql.yml';
        case 'chart':
        case 'dashboard':
        default:
            return '.yml';
    }
};

const writeContent = async (
    contentAsCode: ContentAsCodeType,
    outputDir: string,
    languageMap: boolean,
) => {
    const extension = getFileExtension(contentAsCode.type);
    const itemPath = path.join(
        outputDir,
        `${contentAsCode.content.slug}${extension}`,
    );
    const chartYml = yaml.dump(contentAsCode.content, {
        quotingType: '"',
    });
    await fs.writeFile(itemPath, chartYml);

    if (contentAsCode.translationMap && languageMap) {
        const translationPath = path.join(
            outputDir,
            `${contentAsCode.content.slug}.language.map.yml`,
        );
        await fs.writeFile(
            translationPath,
            yaml.dump(contentAsCode.translationMap),
        );
    }
};

const isLightdashContentFile = (folder: string, entry: Dirent) =>
    entry.isFile() &&
    entry.parentPath.endsWith(path.sep + folder) &&
    entry.name.endsWith('.yml') &&
    !entry.name.endsWith('.language.map.yml');

const loadYamlFile = async <T extends ChartAsCode | DashboardAsCode>(
    file: Dirent,
) => {
    const filePath = path.join(file.parentPath, file.name);
    const [fileContent, stats] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
    ]);

    const item = yaml.load(fileContent) as T;
    const downloadedAt = item.downloadedAt
        ? new Date(item.downloadedAt)
        : undefined;
    const needsUpdating =
        downloadedAt &&
        Math.abs(stats.mtime.getTime() - downloadedAt.getTime()) > 30000;

    return {
        ...item,
        updatedAt: needsUpdating ? stats.mtime : item.updatedAt,
        needsUpdating: needsUpdating ?? true,
    };
};

const readCodeFiles = async <T extends ChartAsCode | DashboardAsCode>(
    folder: 'charts' | 'dashboards',
    customPath?: string,
): Promise<(T & { needsUpdating: boolean })[]> => {
    const baseDir = getDownloadFolder(customPath);

    GlobalState.log(`Reading ${folder} from ${baseDir}`);

    try {
        const allEntries = await fs.readdir(baseDir, {
            recursive: true,
            withFileTypes: true,
        });

        const items = await Promise.all(
            allEntries
                .filter((entry) => isLightdashContentFile(folder, entry))
                .map((file) => loadYamlFile<T>(file)),
        );

        if (items.length === 0) {
            console.error(
                styles.warning(
                    `Unable to upload ${folder}, no files found in "${baseDir}". Run download command first.`,
                ),
            );
        }

        return items;
    } catch (error) {
        // Handle case where base directory doesn't exist
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error(
                styles.warning(
                    `Unable to upload ${folder}, "${baseDir}" folder not found. Run download command first.`,
                ),
            );
            return [];
        }
        // Unknown error
        console.error(styles.error(`Error reading ${baseDir}: ${error}`));
        throw error;
    }
};

const groupBySpace = <T extends ChartAsCode | DashboardAsCode | SqlChartAsCode>(
    items: T[],
): Record<string, Array<{ item: T; index: number }>> => {
    const itemsWithIndex = items.map((item, index) => ({ item, index }));
    return groupBy(itemsWithIndex, (entry) => entry.item.spaceSlug);
};

const writeSpaceContent = async <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>({
    projectName,
    spaceSlug,
    folder,
    contentType,
    contentInSpace,
    contentAsCode,
    customPath,
    languageMap,
    folderScheme,
}: {
    projectName: string;
    spaceSlug: string;
    folder: 'charts' | 'dashboards';
    contentType: ContentAsCodeType['type'];
    contentInSpace: Array<{ item: T; index: number }>;
    contentAsCode:
        | ApiDashboardAsCodeListResponse['results']
        | ApiChartAsCodeListResponse['results']
        | ApiSqlChartAsCodeListResponse['results'];
    customPath?: string;
    languageMap: boolean;
    folderScheme: FolderScheme;
}) => {
    const outputDir = await createDirForContent(
        projectName,
        spaceSlug,
        folder,
        customPath,
        folderScheme,
    );

    for (const { item, index } of contentInSpace) {
        const translationMap =
            'languageMap' in contentAsCode
                ? contentAsCode.languageMap?.[index]
                : undefined;
        await writeContent(
            {
                type: contentType,
                content: item,
                translationMap,
            } as ContentAsCodeType,
            outputDir,
            languageMap,
        );
    }
};

type DownloadContentType = 'charts' | 'dashboards' | 'sqlCharts';

type ContentTypeConfig = {
    endpoint: string;
    displayName: string;
    supportsLanguageMap: boolean;
};

const getContentTypeConfig = (
    type: DownloadContentType,
    projectId: string,
): ContentTypeConfig => {
    switch (type) {
        case 'charts':
            return {
                endpoint: `/api/v1/projects/${projectId}/charts/code`,
                displayName: 'charts',
                supportsLanguageMap: true,
            };
        case 'dashboards':
            return {
                endpoint: `/api/v1/projects/${projectId}/dashboards/code`,
                displayName: 'dashboards',
                supportsLanguageMap: true,
            };
        case 'sqlCharts':
            return {
                endpoint: `/api/v1/projects/${projectId}/sqlCharts/code`,
                displayName: 'SQL charts',
                supportsLanguageMap: false,
            };
        default:
            return assertUnreachable(type, `Unknown content type: ${type}`);
    }
};

const extractChartSlugsFromDashboards = (
    dashboards: DashboardAsCode[],
): string[] =>
    dashboards.reduce<string[]>((acc, dashboard) => {
        const slugs = dashboard.tiles
            .map((tile) =>
                'chartSlug' in tile.properties
                    ? (tile.properties.chartSlug as string)
                    : undefined,
            )
            .filter((slug): slug is string => slug !== undefined);
        return [...acc, ...slugs];
    }, []);

export const downloadContent = async (
    ids: string[],
    type: DownloadContentType,
    projectId: string,
    projectName: string,
    customPath?: string,
    languageMap: boolean = false,
    nested: boolean = false,
): Promise<[number, string[]]> => {
    const spinner = GlobalState.getActiveSpinner();
    const contentFilters = parseContentFilters(ids);
    const folderScheme: FolderScheme = nested ? 'nested' : 'flat';
    const config = getContentTypeConfig(type, projectId);

    let offset = 0;
    let total = 0;
    let chartSlugs: string[] = [];

    do {
        GlobalState.debug(
            `Downloading ${config.displayName} with offset "${offset}" and filters "${contentFilters}"`,
        );

        const commonParams = config.supportsLanguageMap
            ? `offset=${offset}&languageMap=${languageMap}`
            : `offset=${offset}`;
        const queryParams = contentFilters
            ? `${contentFilters}&${commonParams}`
            : `?${commonParams}`;

        const results = await lightdashApi<
            | ApiChartAsCodeListResponse['results']
            | ApiDashboardAsCodeListResponse['results']
            | ApiSqlChartAsCodeListResponse['results']
        >({
            method: 'GET',
            url: `${config.endpoint}${queryParams}`,
            body: undefined,
        });

        spinner?.start(
            `Downloaded ${results.offset} of ${results.total} ${config.displayName}`,
        );

        // For the same chart slug, we run the code for saved charts and sql chart
        // so we are going to get more false positives here, so we keep it on the debug log
        results.missingIds.forEach((missingId) => {
            GlobalState.debug(
                `\nNo ${config.displayName} with id "${missingId}"`,
            );
        });

        // Write content based on type
        if ('sqlCharts' in results) {
            const sqlChartsBySpace = groupBySpace(results.sqlCharts);
            for (const [spaceSlug, sqlChartsInSpace] of Object.entries(
                sqlChartsBySpace,
            )) {
                await writeSpaceContent({
                    projectName,
                    spaceSlug,
                    folder: 'charts',
                    contentType: 'sqlChart',
                    contentInSpace: sqlChartsInSpace,
                    contentAsCode: results,
                    customPath,
                    languageMap,
                    folderScheme,
                });
            }
        } else if ('dashboards' in results) {
            const dashboardsBySpace = groupBySpace(results.dashboards);
            for (const [spaceSlug, dashboardsInSpace] of Object.entries(
                dashboardsBySpace,
            )) {
                await writeSpaceContent({
                    projectName,
                    spaceSlug,
                    folder: 'dashboards',
                    contentType: 'dashboard',
                    contentInSpace: dashboardsInSpace,
                    contentAsCode: results,
                    customPath,
                    languageMap,
                    folderScheme,
                });
            }
            chartSlugs = [
                ...chartSlugs,
                ...extractChartSlugsFromDashboards(results.dashboards),
            ];
        } else {
            const chartsBySpace = groupBySpace(results.charts);
            for (const [spaceSlug, chartsInSpace] of Object.entries(
                chartsBySpace,
            )) {
                await writeSpaceContent({
                    projectName,
                    spaceSlug,
                    folder: 'charts',
                    contentType: 'chart',
                    contentInSpace: chartsInSpace,
                    contentAsCode: results,
                    customPath,
                    languageMap,
                    folderScheme,
                });
            }
        }

        offset = results.offset;
        total = results.total;
    } while (offset < total);

    return [total, [...new Set(chartSlugs)]];
};

export const downloadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const spinner = GlobalState.startSpinner(`Downloading charts`);
    spinner.start(`Downloading content from project`);

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

    // Fetch project details to get project name for folder structure
    const project = await lightdashApi<Project>({
        method: 'GET',
        url: `/api/v1/projects/${projectId}`,
        body: undefined,
    });
    const projectName = generateSlug(project.name);

    // For analytics
    let chartTotal: number | undefined;
    let dashboardTotal: number | undefined;
    const start = Date.now();

    await LightdashAnalytics.track({
        event: 'download.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: config.user?.organizationUuid,
            projectId,
        },
    });
    try {
        const projectDir = path.join(
            getDownloadFolder(options.path),
            projectName,
        );
        const dirExists = () =>
            fs
                .access(projectDir, fs.constants.F_OK)
                .then(() => true)
                .catch(() => false);

        // We clear the output directory first to get the latest state of content
        // regarding projects and spaces if nested.
        if (options.nested && (await dirExists())) {
            await fs.rm(projectDir, { recursive: true });
        }

        // If any filter is provided, we skip those items without filters
        // eg: if a --charts filter is provided, we skip dashboards if no --dashboards filter is provided
        const hasFilters =
            options.charts.length > 0 || options.dashboards.length > 0;

        // Download regular charts
        if (hasFilters && options.charts.length === 0) {
            console.info(
                styles.warning(`No charts filters provided, skipping`),
            );
        } else {
            const [regularChartTotal] = await downloadContent(
                options.charts,
                'charts',
                projectId,
                projectName,
                options.path,
                options.languageMap,
                options.nested,
            );
            spinner.succeed(`Downloaded ${regularChartTotal} charts`);

            // Download SQL charts
            spinner.start(`Downloading SQL charts`);
            const [sqlChartTotal] = await downloadContent(
                options.charts,
                'sqlCharts',
                projectId,
                projectName,
                options.path,
                options.languageMap,
                options.nested,
            );
            spinner.succeed(`Downloaded ${sqlChartTotal} SQL charts`);

            chartTotal = regularChartTotal + sqlChartTotal;
        }

        // Download dashboards
        if (hasFilters && options.dashboards.length === 0) {
            console.info(
                styles.warning(`No dashboards filters provided, skipping`),
            );
        } else {
            let chartSlugs: string[] = [];

            [dashboardTotal, chartSlugs] = await downloadContent(
                options.dashboards,
                'dashboards',
                projectId,
                projectName,
                options.path,
                options.languageMap,
                options.nested,
            );

            spinner.succeed(`Downloaded ${dashboardTotal} dashboards`);

            // If any filter is provided, we download all charts linked to these dashboards
            // We don't need to do this if we download everything (no filters)
            if (hasFilters && chartSlugs.length > 0) {
                spinner.start(
                    `Downloading ${chartSlugs.length} charts linked to dashboards`,
                );

                // Download both regular charts and SQL charts linked to dashboards
                const [regularCharts] = await downloadContent(
                    chartSlugs,
                    'charts',
                    projectId,
                    projectName,
                    options.path,
                    options.languageMap,
                    options.nested,
                );

                const [sqlCharts] = await downloadContent(
                    chartSlugs,
                    'sqlCharts',
                    projectId,
                    projectName,
                    options.path,
                    options.languageMap,
                    options.nested,
                );

                spinner.succeed(
                    `Downloaded ${
                        regularCharts + sqlCharts
                    } charts linked to dashboards`,
                );
            }
        }

        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'download.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartTotal,
                dashboardsNum: dashboardTotal,
                timeToCompleted: (end - start) / 1000, // in seconds
            },
        });
    } catch (error) {
        console.error(styles.error(`\nError downloading ${error}`));
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: `${error}`,
            },
        });
    }
};

const getPromoteAction = (action: PromotionAction) => {
    switch (action) {
        case PromotionAction.CREATE:
            return 'created';
        case PromotionAction.UPDATE:
            return 'updated';
        case PromotionAction.DELETE:
            return 'deleted';
        case PromotionAction.NO_CHANGES:
            return 'skipped';
        default:
            assertUnreachable(action, `Unknown promotion action: ${action}`);
    }
    return 'skipped';
};

const storeUploadChanges = (
    changes: Record<string, number>,
    promoteChanges: PromotionChanges,
): Record<string, number> => {
    const getPromoteChanges = (
        resource: 'spaces' | 'charts' | 'dashboards',
    ) => {
        const promotions: { action: PromotionAction }[] =
            promoteChanges[resource];
        return promotions.reduce<Record<string, number>>(
            (acc, promoteChange) => {
                const action = getPromoteAction(promoteChange.action);
                const key = `${resource} ${action}`;
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            },
            {},
        );
    };

    const updatedChanges: Record<string, number> = {
        ...changes,
    };

    ['spaces', 'charts', 'dashboards'].forEach((resource) => {
        const resourceChanges = getPromoteChanges(
            resource as 'spaces' | 'charts' | 'dashboards',
        );
        Object.entries(resourceChanges).forEach(([key, value]) => {
            updatedChanges[key] = (updatedChanges[key] ?? 0) + value;
        });
    });

    return updatedChanges;
};

const logUploadChanges = (changes: Record<string, number>) => {
    Object.entries(changes).forEach(([key, value]) => {
        console.info(`Total ${key}: ${value} `);
    });
};

// SQL charts have 'sql' field instead of 'tableName'/'metricQuery'
const isSqlChart = (
    item: ChartAsCode | DashboardAsCode | SqlChartAsCode,
): item is SqlChartAsCode => 'sql' in item && !('tableName' in item);

/**
 *
 * @param slugs if slugs are provided, we only force upsert the charts/dashboards that match the slugs, if slugs are empty, we upload files that were locally updated
 */
const upsertResources = async <T extends ChartAsCode | DashboardAsCode>(
    type: 'charts' | 'dashboards',
    projectId: string,
    changes: Record<string, number>,
    force: boolean,
    slugs: string[],
    customPath?: string,
    skipSpaceCreate?: boolean,
    publicSpaceCreate?: boolean,
): Promise<{ changes: Record<string, number>; total: number }> => {
    const config = await getConfig();

    const items = await readCodeFiles<T>(type, customPath);

    console.info(`Found ${items.length} ${type} files`);

    const hasFilter = slugs.length > 0;
    const filteredItems = hasFilter
        ? items.filter((item) => slugs.includes(item.slug))
        : items;
    if (hasFilter) {
        console.info(
            `Filtered ${filteredItems.length} ${type} with slugs: ${slugs.join(
                ', ',
            )}`,
        );
        const missingItems = slugs.filter(
            (slug) => !items.find((item) => item.slug === slug),
        );
        missingItems.forEach((slug) => {
            console.warn(styles.warning(`No ${type} with slug: "${slug}"`));
        });
    }

    for (const item of filteredItems) {
        // If a chart fails to update, we keep updating the rest
        try {
            if (!force && !item.needsUpdating) {
                if (hasFilter) {
                    console.warn(
                        styles.warning(
                            `Skipping ${type} "${item.slug}" with no local changes`,
                        ),
                    );
                }
                GlobalState.debug(
                    `Skipping ${type} "${item.slug}" with no local changes`,
                );
                changes[`${type} skipped`] =
                    (changes[`${type} skipped`] ?? 0) + 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            GlobalState.debug(`Upserting ${type} ${item.slug}`);

            // SQL charts use a different endpoint
            const isSqlChartItem = type === 'charts' && isSqlChart(item);
            const endpoint = isSqlChartItem
                ? `/api/v1/projects/${projectId}/sqlCharts/${item.slug}/code`
                : `/api/v1/projects/${projectId}/${type}/${item.slug}/code`;

            const upsertData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: endpoint,
                body: JSON.stringify({
                    ...item,
                    skipSpaceCreate,
                    publicSpaceCreate,
                }),
            });

            GlobalState.debug(
                `${type} "${item.name}": ${upsertData[type]?.[0].action}`,
            );

            changes = storeUploadChanges(changes, upsertData);
        } catch (error: unknown) {
            if (
                error instanceof LightdashError &&
                error.name === 'NotFoundError' &&
                skipSpaceCreate
            ) {
                console.warn(
                    styles.warning(
                        `Skipping ${type} "${item.slug}" because space "${item.spaceSlug}" does not exist and --skip-space-create is true`,
                    ),
                );
                changes[`${type} skipped`] =
                    (changes[`${type} skipped`] ?? 0) + 1;
            } else {
                changes[`${type} with errors`] =
                    (changes[`${type} with errors`] ?? 0) + 1;
                console.error(
                    styles.error(
                        `Error upserting ${type}: ${getErrorMessage(error)}`,
                    ),
                );

                await LightdashAnalytics.track({
                    event: 'download.error',
                    properties: {
                        userId: config.user?.userUuid,
                        organizationId: config.user?.organizationUuid,
                        projectId,
                        type,
                        error: getErrorMessage(error),
                    },
                });
            }
        }
    }
    return { changes, total: filteredItems.length };
};

const getDashboardChartSlugs = async (
    dashboardSlugs: string[],
    customPath?: string,
) => {
    const dashboardItems = await readCodeFiles<DashboardAsCode>(
        'dashboards',
        customPath,
    );

    const filteredDashboardItems =
        dashboardSlugs.length > 0
            ? dashboardItems.filter((dashboard) =>
                  dashboardSlugs.includes(dashboard.slug),
              )
            : dashboardItems;

    return filteredDashboardItems.reduce<string[]>((acc, dashboard) => {
        const dashboardChartSlugs = dashboard.tiles
            .map((tile) =>
                'chartSlug' in tile.properties
                    ? tile.properties.chartSlug
                    : undefined,
            )
            .filter(
                (dashboardChartSlug): dashboardChartSlug is string =>
                    !!dashboardChartSlug,
            );

        return [...acc, ...dashboardChartSlugs];
    }, []);
};

export const uploadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
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

    let changes: Record<string, number> = {};
    // For analytics
    let chartTotal: number | undefined;
    let dashboardTotal: number | undefined;
    const start = Date.now();

    await LightdashAnalytics.track({
        event: 'upload.started',
        properties: {
            userId: config.user?.userUuid,
            organizationId: config.user?.organizationUuid,
            projectId,
        },
    });

    try {
        // If any filter is provided, we skip those items without filters
        // eg: if a --charts filter is provided, we skip dashboards if no --dashboards filter is provided
        const hasFilters =
            options.charts.length > 0 || options.dashboards.length > 0;

        // Always include the charts from dashboards if includeCharts is true regardless of the charts filters
        const chartSlugs = options.includeCharts
            ? Array.from(
                  new Set([
                      ...options.charts,
                      ...(await getDashboardChartSlugs(
                          options.dashboards,
                          options.path,
                      )),
                  ]),
              )
            : options.charts;

        if (hasFilters && chartSlugs.length === 0) {
            console.info(
                styles.warning(`No charts filters provided, skipping`),
            );
        } else {
            const { changes: chartChanges, total } =
                await upsertResources<ChartAsCode>(
                    'charts',
                    projectId,
                    changes,
                    options.force,
                    chartSlugs,
                    options.path,
                    options.skipSpaceCreate,
                    options.public,
                );
            changes = chartChanges;
            chartTotal = total;
        }

        if (hasFilters && options.dashboards.length === 0) {
            console.info(
                styles.warning(`No dashboard filters provided, skipping`),
            );
        } else {
            const { changes: dashboardChanges, total } =
                await upsertResources<DashboardAsCode>(
                    'dashboards',
                    projectId,
                    changes,
                    options.force,
                    options.dashboards,
                    options.path,
                    options.skipSpaceCreate,
                    options.public,
                );
            changes = dashboardChanges;
            dashboardTotal = total;
        }
        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'upload.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartTotal,
                dashboardsNum: dashboardTotal,
                timeToCompleted: (end - start) / 1000, // in seconds
            },
        });

        logUploadChanges(changes);
    } catch (error) {
        console.error(
            styles.error(`\nError downloading: ${getErrorMessage(error)}`),
        );
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: getErrorMessage(error),
            },
        });
    }
};
