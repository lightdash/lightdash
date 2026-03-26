/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiChartValidationResponse,
    ApiDashboardAsCodeListResponse,
    ApiDashboardValidationResponse,
    ApiSqlChartAsCodeListResponse,
    assertUnreachable,
    AuthorizationError,
    ChartAsCode,
    ContentAsCodeType as ContentAsCodeTypeEnum,
    DashboardAsCode,
    generateSlug,
    getErrorMessage,
    LightdashError,
    Project,
    PromotionAction,
    PromotionChanges,
    SqlChartAsCode,
} from '@lightdash/common';
import { Dirent, promises as fs, type Stats } from 'fs';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import pLimit from 'p-limit';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setAnswer } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import {
    checkLightdashVersion,
    lightdashApi,
    setGzipEnabled,
} from './dbt/apiClient';
import {
    LightdashMetadata,
    METADATA_FILENAME,
    readMetadataFile,
    writeMetadataFile,
} from './metadataFile';
import { logSelectedProject, selectProject } from './selectProject';

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
    validate?: boolean; // Validate charts and dashboards after upload
    concurrency: number;
    gzip?: boolean;
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

type MetadataEntry = {
    slug: string;
    type: 'charts' | 'dashboards';
    downloadedAt: string;
};

const writeContent = async (
    contentAsCode: ContentAsCodeType,
    outputDir: string,
    languageMap: boolean,
): Promise<MetadataEntry> => {
    const extension = getFileExtension(contentAsCode.type);
    const itemPath = path.join(
        outputDir,
        `${contentAsCode.content.slug}${extension}`,
    );
    // Strip timestamps — they go to .lightdash-metadata.json instead
    const { updatedAt, downloadedAt, ...cleanContent } =
        contentAsCode.content as ChartAsCode | SqlChartAsCode | DashboardAsCode;
    const chartYml = yaml.dump(cleanContent, {
        quotingType: '"',
        sortKeys: true,
    });
    await fs.writeFile(itemPath, chartYml);

    if (contentAsCode.translationMap && languageMap) {
        const translationPath = path.join(
            outputDir,
            `${contentAsCode.content.slug}.language.map.yml`,
        );
        await fs.writeFile(
            translationPath,
            yaml.dump(contentAsCode.translationMap, { sortKeys: true }),
        );
    }

    const metadataType =
        contentAsCode.type === 'dashboard' ? 'dashboards' : 'charts';

    let downloadedAtString: string;
    if (downloadedAt instanceof Date) {
        downloadedAtString = downloadedAt.toISOString();
    } else if (typeof downloadedAt === 'string') {
        downloadedAtString = downloadedAt;
    } else {
        downloadedAtString = new Date().toISOString();
    }

    return {
        slug: contentAsCode.content.slug,
        type: metadataType,
        downloadedAt: downloadedAtString,
    };
};

const hasUnsortedKeys = (obj: unknown): boolean => {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        if (Array.isArray(obj)) {
            return obj.some(hasUnsortedKeys);
        }
        return false;
    }
    const keys = Object.keys(obj);
    const sorted = [...keys].sort();
    if (keys.some((key, i) => key !== sorted[i])) {
        return true;
    }
    return Object.values(obj).some(hasUnsortedKeys);
};

const isLightdashContentFile = (folder: string, entry: Dirent) =>
    entry.isFile() &&
    entry.parentPath &&
    entry.parentPath.endsWith(path.sep + folder) &&
    entry.name.endsWith('.yml') &&
    !entry.name.endsWith('.language.map.yml');

const isLooseContentFile = (entry: Dirent) =>
    entry.isFile() &&
    entry.parentPath &&
    !entry.parentPath.endsWith(`${path.sep}charts`) &&
    !entry.parentPath.endsWith(`${path.sep}dashboards`) &&
    entry.name.endsWith('.yml') &&
    !entry.name.endsWith('.language.map.yml');

const processYamlItem = <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>(
    item: T,
    fileName: string,
    stats: Stats,
    folder: 'charts' | 'dashboards',
    metadata: LightdashMetadata,
) => {
    if (hasUnsortedKeys(item)) {
        GlobalState.log(
            styles.warning(
                `Warning: ${fileName} has unsorted YAML keys. Re-download to fix, or sort keys alphabetically.`,
            ),
        );
    }
    const metadataSection =
        folder === 'dashboards' ? metadata.dashboards : metadata.charts;
    const downloadedAtRaw: string | Date | undefined =
        (metadataSection[item.slug] as string | undefined) ?? item.downloadedAt;
    const downloadedAt = downloadedAtRaw
        ? new Date(
              downloadedAtRaw instanceof Date
                  ? downloadedAtRaw.getTime()
                  : downloadedAtRaw,
          )
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

const loadYamlFile = async <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>(
    file: Dirent,
    folder: 'charts' | 'dashboards',
    metadata: LightdashMetadata,
) => {
    const filePath = path.join(file.parentPath, file.name);
    const [fileContent, stats] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
    ]);

    const item = yaml.load(fileContent) as T;
    return processYamlItem(item, file.name, stats, folder, metadata);
};

const readCodeFiles = async <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>(
    folder: 'charts' | 'dashboards',
    customPath?: string,
): Promise<(T & { needsUpdating: boolean })[]> => {
    const baseDir = getDownloadFolder(customPath);

    GlobalState.log(`Reading ${folder} from ${baseDir}`);

    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 20 || (major === 20 && minor < 12)) {
        throw new Error(
            `Node.js v20.12.0 or later is required for this command (current: ${process.version}).`,
        );
    }

    try {
        const metadata = await readMetadataFile(baseDir);

        const allEntries = await fs.readdir(baseDir, {
            recursive: true,
            withFileTypes: true,
        });

        const items = await Promise.all(
            allEntries
                .filter((entry) => isLightdashContentFile(folder, entry))
                .map((file) => loadYamlFile<T>(file, folder, metadata)),
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

/**
 * Reads YAML files outside the standard charts/ and dashboards/ directories
 * and classifies them by their contentType field.
 */
const readLooseCodeFiles = async (
    customPath?: string,
): Promise<{
    charts: (ChartAsCode & { needsUpdating: boolean })[];
    dashboards: (DashboardAsCode & { needsUpdating: boolean })[];
}> => {
    const baseDir = getDownloadFolder(customPath);
    const charts: (ChartAsCode & { needsUpdating: boolean })[] = [];
    const dashboards: (DashboardAsCode & { needsUpdating: boolean })[] = [];

    try {
        const metadata = await readMetadataFile(baseDir);

        const allEntries = await fs.readdir(baseDir, {
            recursive: true,
            withFileTypes: true,
        });

        const looseFiles = allEntries.filter(isLooseContentFile);

        await Promise.all(
            looseFiles.map(async (file) => {
                try {
                    const filePath = path.join(file.parentPath, file.name);
                    const [fileContent, stats] = await Promise.all([
                        fs.readFile(filePath, 'utf-8'),
                        fs.stat(filePath),
                    ]);

                    const parsed = yaml.load(fileContent) as Record<
                        string,
                        unknown
                    >;
                    const contentType = parsed?.contentType;

                    if (
                        contentType === ContentAsCodeTypeEnum.CHART ||
                        contentType === ContentAsCodeTypeEnum.SQL_CHART
                    ) {
                        charts.push(
                            processYamlItem<ChartAsCode>(
                                parsed as ChartAsCode,
                                file.name,
                                stats,
                                'charts',
                                metadata,
                            ),
                        );
                    } else if (
                        contentType === ContentAsCodeTypeEnum.DASHBOARD
                    ) {
                        dashboards.push(
                            processYamlItem<DashboardAsCode>(
                                parsed as DashboardAsCode,
                                file.name,
                                stats,
                                'dashboards',
                                metadata,
                            ),
                        );
                    } else {
                        GlobalState.debug(
                            `Skipping ${file.name}: no recognized contentType`,
                        );
                    }
                } catch (e) {
                    GlobalState.debug(
                        `Skipping ${file.name}: failed to parse (${getErrorMessage(e)})`,
                    );
                }
            }),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // Base directory doesn't exist — nothing to discover
            return { charts, dashboards };
        }
        throw error;
    }

    return { charts, dashboards };
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
}): Promise<MetadataEntry[]> => {
    const outputDir = await createDirForContent(
        projectName,
        spaceSlug,
        folder,
        customPath,
        folderScheme,
    );

    const entries: MetadataEntry[] = [];
    for (const { item, index } of contentInSpace) {
        const translationMap =
            'languageMap' in contentAsCode
                ? contentAsCode.languageMap?.[index]
                : undefined;
        const entry = await writeContent(
            {
                type: contentType,
                content: item,
                translationMap,
            } as ContentAsCodeType,
            outputDir,
            languageMap,
        );
        entries.push(entry);
    }
    return entries;
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
): Promise<[number, string[], MetadataEntry[]]> => {
    const spinner = GlobalState.getActiveSpinner();
    const contentFilters = parseContentFilters(ids);
    const folderScheme: FolderScheme = nested ? 'nested' : 'flat';
    const config = getContentTypeConfig(type, projectId);

    let offset = 0;
    let total = 0;
    let chartSlugs: string[] = [];
    let allMetadataEntries: MetadataEntry[] = [];

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
                const entries = await writeSpaceContent({
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
                allMetadataEntries = [...allMetadataEntries, ...entries];
            }
        } else if ('dashboards' in results) {
            const dashboardsBySpace = groupBySpace(results.dashboards);
            for (const [spaceSlug, dashboardsInSpace] of Object.entries(
                dashboardsBySpace,
            )) {
                const entries = await writeSpaceContent({
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
                allMetadataEntries = [...allMetadataEntries, ...entries];
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
                const entries = await writeSpaceContent({
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
                allMetadataEntries = [...allMetadataEntries, ...entries];
            }
        }

        offset = results.offset;
        total = results.total;
    } while (offset < total);

    return [total, [...new Set(chartSlugs)], allMetadataEntries];
};

export const downloadHandler = async (
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

    const projectSelection = await selectProject(config, options.project);
    if (!projectSelection) {
        throw new LightdashError({
            message: 'No project selected. Run lightdash config set-project',
            name: 'Not Found',
            statusCode: 404,
            data: {},
        });
    }
    const projectId = projectSelection.projectUuid;

    // Log current project info
    logSelectedProject(projectSelection, config, 'Downloading from');

    const spinner = GlobalState.startSpinner(`Downloading charts`);
    spinner.start(`Downloading content from project`);

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
        const hasFilters =
            options.charts.length > 0 || options.dashboards.length > 0;

        let allMetadataEntries: MetadataEntry[] = [];

        // Download regular charts
        if (hasFilters && options.charts.length === 0) {
            console.info(
                styles.warning(`No charts filters provided, skipping`),
            );
        } else {
            const [regularChartTotal, , regularChartMeta] =
                await downloadContent(
                    options.charts,
                    'charts',
                    projectId,
                    projectName,
                    options.path,
                    options.languageMap,
                    options.nested,
                );
            spinner.succeed(`Downloaded ${regularChartTotal} charts`);
            allMetadataEntries = [...allMetadataEntries, ...regularChartMeta];

            // Download SQL charts
            spinner.start(`Downloading SQL charts`);
            const [sqlChartTotal, , sqlChartMeta] = await downloadContent(
                options.charts,
                'sqlCharts',
                projectId,
                projectName,
                options.path,
                options.languageMap,
                options.nested,
            );
            spinner.succeed(`Downloaded ${sqlChartTotal} SQL charts`);
            allMetadataEntries = [...allMetadataEntries, ...sqlChartMeta];

            chartTotal = regularChartTotal + sqlChartTotal;
        }

        // Download dashboards
        if (hasFilters && options.dashboards.length === 0) {
            console.info(
                styles.warning(`No dashboards filters provided, skipping`),
            );
        } else {
            let chartSlugs: string[] = [];

            let dashMeta: MetadataEntry[];
            [dashboardTotal, chartSlugs, dashMeta] = await downloadContent(
                options.dashboards,
                'dashboards',
                projectId,
                projectName,
                options.path,
                options.languageMap,
                options.nested,
            );
            allMetadataEntries = [...allMetadataEntries, ...dashMeta];

            spinner.succeed(`Downloaded ${dashboardTotal} dashboards`);

            if (hasFilters && chartSlugs.length > 0) {
                spinner.start(
                    `Downloading ${chartSlugs.length} charts linked to dashboards`,
                );

                const [regularCharts, , linkedChartMeta] =
                    await downloadContent(
                        chartSlugs,
                        'charts',
                        projectId,
                        projectName,
                        options.path,
                        options.languageMap,
                        options.nested,
                    );
                allMetadataEntries = [
                    ...allMetadataEntries,
                    ...linkedChartMeta,
                ];

                const [sqlCharts, , linkedSqlMeta] = await downloadContent(
                    chartSlugs,
                    'sqlCharts',
                    projectId,
                    projectName,
                    options.path,
                    options.languageMap,
                    options.nested,
                );
                allMetadataEntries = [...allMetadataEntries, ...linkedSqlMeta];

                spinner.succeed(
                    `Downloaded ${
                        regularCharts + sqlCharts
                    } charts linked to dashboards`,
                );
            }
        }

        // Write metadata file with all downloadedAt timestamps
        const metadataToWrite: LightdashMetadata = {
            version: 1,
            charts: {},
            dashboards: {},
        };
        for (const entry of allMetadataEntries) {
            metadataToWrite[entry.type][entry.slug] = entry.downloadedAt;
        }
        const baseDir = getDownloadFolder(options.path);
        const downloadRoot = options.nested
            ? path.join(baseDir, projectName)
            : baseDir;
        await writeMetadataFile(baseDir, metadataToWrite);
        if (!config.answers?.metadataFileGitignoreNoticeShown) {
            GlobalState.log(
                styles.warning(
                    `\nNote: ${METADATA_FILENAME} was written to ${baseDir}. Consider adding it to your .gitignore.`,
                ),
            );
            await setAnswer({ metadataFileGitignoreNoticeShown: true });
        }
        GlobalState.log(
            styles.success(`Downloaded content saved to ${downloadRoot}`),
        );

        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'download.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                chartsNum: chartTotal,
                dashboardsNum: dashboardTotal,
                timeToCompleted: (end - start) / 1000,
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

    const totalSkipped = Object.entries(changes)
        .filter(([key]) => key.includes('skipped'))
        .reduce((sum, [, value]) => sum + value, 0);
    const totalUpserted = Object.entries(changes)
        .filter(([key]) => !key.includes('skipped'))
        .reduce((sum, [, value]) => sum + value, 0);

    if (totalSkipped > 0 && totalUpserted === 0) {
        console.warn(
            styles.warning(
                `\nAll content was skipped (no local changes detected). Use --force to upload all content, e.g. when uploading to a new project.`,
            ),
        );
    }
};

// SQL charts have 'sql' field instead of 'tableName'/'metricQuery'
const isSqlChart = (
    item: ChartAsCode | DashboardAsCode | SqlChartAsCode,
): item is SqlChartAsCode => 'sql' in item && !('tableName' in item);

const upsertSingleItem = async <T extends ChartAsCode | DashboardAsCode>(
    item: T & { needsUpdating: boolean },
    type: 'charts' | 'dashboards',
    projectId: string,
    changes: Record<string, number>,
    force: boolean,
    config: { user?: { userUuid?: string; organizationUuid?: string } },
    skipSpaceCreate?: boolean,
    publicSpaceCreate?: boolean,
    validate?: boolean,
): Promise<void> => {
    try {
        if (!force && !item.needsUpdating) {
            GlobalState.debug(
                `Skipping ${type} "${item.slug}" with no local changes`,
            );
            changes[`${type} skipped`] = (changes[`${type} skipped`] ?? 0) + 1;
            return;
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
                force,
            }),
        });

        GlobalState.debug(
            `${type} "${item.name}": ${upsertData[type]?.[0].action}`,
        );

        // Merge storeUploadChanges result into changes in-place
        const updatedChanges = storeUploadChanges(changes, upsertData);
        Object.keys(updatedChanges).forEach((key) => {
            changes[key] = updatedChanges[key];
        });

        // Warn if contentType contradicts the folder this item came from
        const itemContentType = (
            item as ChartAsCode | DashboardAsCode | SqlChartAsCode
        ).contentType;
        if (itemContentType) {
            const expectedType =
                itemContentType === ContentAsCodeTypeEnum.DASHBOARD
                    ? 'dashboards'
                    : 'charts';
            if (expectedType !== type) {
                GlobalState.log(
                    styles.warning(
                        `Warning: "${item.name}" has contentType "${itemContentType}" but is in the ${type}/ directory. It will be uploaded as a ${type.slice(0, -1)}.`,
                    ),
                );
            }
        }

        // Run validation if requested
        if (validate && !isSqlChartItem) {
            const contentUuid =
                type === 'charts'
                    ? upsertData.charts?.[0]?.data?.uuid
                    : upsertData.dashboards?.[0]?.data?.uuid;

            if (contentUuid) {
                try {
                    const validationEndpoint =
                        type === 'charts'
                            ? `/api/v1/projects/${projectId}/validate/chart/${contentUuid}`
                            : `/api/v1/projects/${projectId}/validate/dashboard/${contentUuid}`;

                    const validationResult = await lightdashApi<
                        | ApiChartValidationResponse['results']
                        | ApiDashboardValidationResponse['results']
                    >({
                        method: 'POST',
                        url: validationEndpoint,
                        body: JSON.stringify({}),
                    });

                    if (
                        validationResult.errors &&
                        validationResult.errors.length > 0
                    ) {
                        GlobalState.log(
                            styles.warning(
                                `Validation found ${validationResult.errors.length} issue(s) in ${type.slice(0, -1)} "${item.name}"`,
                            ),
                        );
                        validationResult.errors.forEach((error) => {
                            GlobalState.log(
                                styles.warning(`  - ${error.error}`),
                            );
                        });
                    } else {
                        GlobalState.log(
                            styles.success(
                                `✓ No validation issues in ${type.slice(0, -1)} "${item.name}"`,
                            ),
                        );
                    }
                } catch (validationError) {
                    GlobalState.debug(
                        `Validation failed for ${type.slice(0, -1)} "${item.name}": ${getErrorMessage(validationError)}`,
                    );
                }
            }
        }
    } catch (error: unknown) {
        if (
            error instanceof LightdashError &&
            error.name === 'NotFoundError' &&
            skipSpaceCreate
        ) {
            GlobalState.log(
                styles.warning(
                    `Skipping ${type} "${item.slug}" because space "${item.spaceSlug}" does not exist and --skip-space-create is true`,
                ),
            );
            changes[`${type} skipped`] = (changes[`${type} skipped`] ?? 0) + 1;
        } else {
            changes[`${type} with errors`] =
                (changes[`${type} with errors`] ?? 0) + 1;
            GlobalState.log(
                styles.error(
                    `Error upserting ${type}:\n\t"${item.name}" (slug: "${
                        item.slug
                    }")\n\t${getErrorMessage(error)}`,
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
};

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
    validate?: boolean,
    concurrency: number = 1,
    extraItems: (T & { needsUpdating: boolean })[] = [],
): Promise<{ changes: Record<string, number>; total: number }> => {
    const config = await getConfig();

    const folderItems = await readCodeFiles<T>(type, customPath);
    const items = [...folderItems, ...extraItems];

    GlobalState.log(`Found ${items.length} ${type} files`);

    const hasFilter = slugs.length > 0;
    const filteredItems = hasFilter
        ? items.filter((item) => slugs.includes(item.slug))
        : items;
    if (hasFilter) {
        GlobalState.log(
            `Filtered ${filteredItems.length} ${type} with slugs: ${slugs.join(
                ', ',
            )}`,
        );
        const missingItems = slugs.filter(
            (slug) => !items.find((item) => item.slug === slug),
        );
        missingItems.forEach((slug) => {
            GlobalState.log(styles.warning(`No ${type} with slug: "${slug}"`));
        });
    }

    if (concurrency <= 1) {
        // Sequential path — preserves original behavior exactly
        for (const item of filteredItems) {
            // eslint-disable-next-line no-await-in-loop
            await upsertSingleItem(
                item,
                type,
                projectId,
                changes,
                force,
                config,
                skipSpaceCreate,
                publicSpaceCreate,
                validate,
            );
        }
    } else {
        // Two-phase parallel path
        // Phase 1: Seed one item per unique spaceSlug (and dashboardSlug for charts)
        // sequentially. This avoids backend race conditions in getOrCreateSpace()
        // and in placeholder dashboard creation for charts within dashboards.
        type ItemWithUpdate = T & { needsUpdating: boolean };
        const grouped = groupBy(
            filteredItems,
            (item: ItemWithUpdate) => item.spaceSlug,
        ) as Record<string, ItemWithUpdate[]>;
        const seedItems = new Set<T & { needsUpdating: boolean }>();
        const remainingItems: Array<T & { needsUpdating: boolean }> = [];

        Object.values(grouped).forEach((spaceItems: ItemWithUpdate[]) => {
            // Pick the first item that will actually trigger an API call
            // (and thus create the space). If force is true, any item works.
            const seedIndex = force
                ? 0
                : spaceItems.findIndex((i) => i.needsUpdating);
            if (seedIndex >= 0) {
                seedItems.add(spaceItems[seedIndex]);
                remainingItems.push(
                    ...spaceItems.filter((_, idx) => idx !== seedIndex),
                );
            } else {
                // No items need updating — all will be skipped, no space needed
                remainingItems.push(...spaceItems);
            }
        });

        // For charts: also seed one item per unique dashboardSlug to avoid
        // concurrent placeholder dashboard creation (duplicate slug bug)
        if (type === 'charts') {
            const chartsWithDashboard = remainingItems.filter(
                (item) =>
                    'dashboardSlug' in item &&
                    (item as unknown as ChartAsCode).dashboardSlug,
            );
            const groupedByDashboard = groupBy(
                chartsWithDashboard,
                (item) => (item as unknown as ChartAsCode).dashboardSlug,
            );
            Object.values(groupedByDashboard).forEach((dashboardItems) => {
                // If no item for this dashboardSlug was already picked as a
                // space seed, pick the first one as a dashboard seed
                const alreadySeeded = dashboardItems.some((item) =>
                    seedItems.has(item),
                );
                if (!alreadySeeded) {
                    const seedIndex = force
                        ? 0
                        : dashboardItems.findIndex((i) => i.needsUpdating);
                    if (seedIndex >= 0) {
                        seedItems.add(dashboardItems[seedIndex]);
                        // Remove from remainingItems since it's now a seed
                        const idx = remainingItems.indexOf(
                            dashboardItems[seedIndex],
                        );
                        if (idx >= 0) {
                            remainingItems.splice(idx, 1);
                        }
                    }
                }
            });
        }

        // Phase 1: Sequential seeding (spaces + dashboard placeholders)
        for (const item of seedItems) {
            // eslint-disable-next-line no-await-in-loop
            await upsertSingleItem(
                item,
                type,
                projectId,
                changes,
                force,
                config,
                skipSpaceCreate,
                publicSpaceCreate,
                validate,
            );
        }

        // Phase 2: Parallel bulk upload of remaining items
        const limit = pLimit(concurrency);
        await Promise.all(
            remainingItems.map((item) =>
                limit(async () => {
                    await upsertSingleItem(
                        item,
                        type,
                        projectId,
                        changes,
                        force,
                        config,
                        skipSpaceCreate,
                        publicSpaceCreate,
                        validate,
                    );
                }),
            ),
        );
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
    if (options.gzip) {
        setGzipEnabled(true);
    }
    await checkLightdashVersion();
    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const projectSelection = await selectProject(config, options.project);
    if (!projectSelection) {
        throw new LightdashError({
            message: 'No project selected. Run lightdash config set-project',
            name: 'Not Found',
            statusCode: 404,
            data: {},
        });
    }
    const projectId = projectSelection.projectUuid;

    // Log current project info
    logSelectedProject(projectSelection, config, 'Uploading to');

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

        const concurrency = Math.min(
            Math.max(1, parseInt(String(options.concurrency), 10) || 1),
            1000,
        );

        if (parseInt(String(options.concurrency), 10) > 1000) {
            GlobalState.log(
                styles.warning(
                    `Concurrency limit exceeded. Using maximum of 1000 instead of ${options.concurrency}`,
                ),
            );
        }

        // Discover loose YAML files (outside charts/ and dashboards/) classified by contentType
        const looseFiles = await readLooseCodeFiles(options.path);
        if (looseFiles.charts.length > 0) {
            GlobalState.log(
                `Found ${looseFiles.charts.length} chart(s) outside charts/ directory (classified by contentType)`,
            );
        }
        if (looseFiles.dashboards.length > 0) {
            GlobalState.log(
                `Found ${looseFiles.dashboards.length} dashboard(s) outside dashboards/ directory (classified by contentType)`,
            );
        }

        if (hasFilters && chartSlugs.length === 0) {
            GlobalState.log(
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
                    options.validate,
                    concurrency,
                    looseFiles.charts,
                );
            changes = chartChanges;
            chartTotal = total;
        }

        if (hasFilters && options.dashboards.length === 0) {
            GlobalState.log(
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
                    options.validate,
                    concurrency,
                    looseFiles.dashboards,
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
        GlobalState.log(
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
