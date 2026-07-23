/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    AgentAsCode,
    AlertAsCode,
    ApiAgentAsCodeListResponse,
    ApiAgentAsCodeUpsertResponse,
    ApiAlertAsCodeListResponse,
    ApiAlertAsCodeUpsertResponse,
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiChartValidationResponse,
    ApiContentResponse,
    ApiDashboardAsCodeListResponse,
    ApiDashboardValidationResponse,
    ApiEmbedProjectAppsResponse,
    ApiGoogleSheetsSyncAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeUpsertResponse,
    ApiImportAppCodeResponse,
    ApiScheduledDeliveryAsCodeListResponse,
    ApiScheduledDeliveryAsCodeUpsertResponse,
    ApiSqlChartAsCodeListResponse,
    ApiVirtualViewAsCodeListResponse,
    ApiVirtualViewAsCodeUpsertResponse,
    assertUnreachable,
    AuthorizationError,
    ChartAsCode,
    computeCustomDependencies,
    ContentAsCodeType as ContentAsCodeTypeEnum,
    DashboardAsCode,
    generateSlug,
    getErrorMessage,
    GoogleSheetsSyncAsCode,
    LightdashError,
    ParameterError,
    Project,
    PromotionAction,
    PromotionChanges,
    removePivotedSeriesValuesFromChartConfig,
    ScheduledDeliveryAsCode,
    SqlChartAsCode,
    validateDataAppDependencies,
    VirtualViewAsCode,
    type DataAppCodeDownload,
    type SpaceAsCode,
} from '@lightdash/common';
import { Dirent, promises as fs, type Stats } from 'fs';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import pLimit from 'p-limit';
import * as path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setAnswer } from '../config';
import { CLI_VERSION } from '../env';
import GlobalState from '../globalState';
import * as styles from '../styles';
import {
    createContentAsCodeOutput,
    logContentAsCodeDiscovery,
    type ContentAsCodeOutput,
    type ContentAsCodeOutputVariant,
} from '../terminal/contentAsCodeOutput';
import {
    appFolderName,
    applySdkMirrorToTemplateDeps,
    attachDependenciesToCode,
    buildDepsWarningLines,
    buildImportBody,
    readBundleFromDir,
    readDependenciesFromDir,
    retargetManifest,
    writeBundleToDir,
    writeContextToDir,
    writeDependenciesToDir,
    writeFilesToDir,
} from './apps/appCodeFiles';
import {
    appsDownloadSummary,
    capListedApps,
    classifyAppDownloadError,
    classifyAppUpload,
    ensureDownloadedAppContext,
    manifestRetargetHint,
    resolveAppsLimit,
    selectAppsToDownload,
    shouldFallBackToSpaceScopedListing,
    type AppDownloadFailure,
} from './apps/appsDownload';
import {
    buildStaticAuthoringFiles,
    loadTemplateDependencies,
} from './apps/scaffolding';
import {
    AI_AGENT_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
    GOOGLE_SHEETS_CODE_RESOURCE,
    SCHEDULED_DELIVERY_CODE_RESOURCE,
    VIRTUAL_VIEW_CODE_RESOURCE,
} from './contentAsCode/projectResources';
import {
    assertCodeResourceFilesValid,
    readCodeResourceFiles,
    writeCodeResourceDocuments,
    type CodeResourceDefinition,
} from './contentAsCode/resource';
import { getDownloadFolder } from './contentAsCodePaths';
import {
    checkLightdashVersion,
    getContentAsCodeUploadPermissions,
    lightdashApi,
    setGzipEnabled,
} from './dbt/apiClient';
import {
    LightdashMetadata,
    METADATA_FILENAME,
    readMetadataFile,
    writeMetadataFile,
} from './metadataFile';
import {
    downloadOrganizationContent,
    uploadOrganizationContent,
} from './organizationContent';
import { logSelectedProject, selectProject } from './selectProject';
import {
    assertUniqueSpacePaths,
    createSpaceAsCodeDownloadError,
    createSpaceAsCodeUploadError,
    downloadSpaces,
    getFlatSpaceFileNames,
    getSpaceNames,
    getUniqueExistingSpaceFilePathsBySlug,
    isSpaceAsCodeDownloadError,
    isSpaceAsCodeFetchError,
    isSpaceAsCodeUploadError,
    logUploadChanges,
    readSpaceFiles,
    readSpaceNames,
    shouldFallBackToEmbeddedSpaces,
    sortSpaceFilesParentFirst,
    upsertSpaces,
    validateSpaceIdentity,
    writeSpaceFiles,
    type SpaceCodeFile,
} from './spacesAsCode';

export type DownloadHandlerOptions = {
    verbose: boolean;
    charts: string[]; // These can be slugs, uuids or urls
    dashboards: string[]; // These can be slugs, uuids or urls
    alerts: string[];
    agents: string[];
    googleSheets: string[];
    scheduledDeliveries: string[];
    virtualViews: string[];
    apps?: string[]; // specific app UUIDs (enterprise); absent = no explicit selection
    includeAgents?: boolean;
    includeApps?: boolean; // download: all of the project's apps, capped at --apps-limit; upload: all app folders on disk
    appsLimit?: string; // download only: cap for the --include-apps listing (default 50); raw string from commander
    createNew?: boolean; // upload only: always create a new app instead of updating the manifest's app
    force: boolean;
    path?: string; // New optional path parameter
    project?: string;
    languageMap: boolean;
    skipSpaceCreate: boolean;
    skipSpaceAccess?: boolean; // Upload only: preserve destination access policies
    public: boolean;
    includeCharts: boolean;
    nested: boolean; // Use nested folder structure (projectName/spaceSlug/charts|dashboards)
    rootSpaces: boolean; // Write new flat space files at the content root (legacy layout)
    skipSpaces: boolean; // Skip first-class space definitions and access
    spacesOnly?: boolean; // Download/upload only first-class space definitions
    skipCharts: boolean; // Skip downloading charts and SQL charts
    skipDashboards: boolean; // Skip downloading dashboards
    skipAlerts: boolean;
    skipAgents: boolean;
    skipGoogleSheets: boolean;
    skipScheduledDeliveries: boolean;
    skipVirtualViews: boolean;
    includeAlerts: boolean;
    includeGoogleSheets: boolean;
    includeScheduledDeliveries: boolean;
    includeVirtualViews: boolean;
    includeAll: boolean;
    appsOnly?: boolean; // download only: implies skipCharts + skipDashboards + skipSpaces
    stripPivotSeries: boolean; // Strip per-value pivot series config for portable chart YAML
    validate?: boolean; // Validate charts and dashboards after upload
    concurrency: number;
    gzip?: boolean;
    organization: boolean;
    sendInvites?: boolean;
};

type FolderScheme = 'flat' | 'nested';

const shouldDownloadAiAgents = ({
    includeAll,
    includeAgents,
    agents,
    appsOnly,
}: Pick<
    DownloadHandlerOptions,
    'includeAll' | 'includeAgents' | 'agents' | 'appsOnly'
>): boolean =>
    appsOnly !== true &&
    (includeAll === true || includeAgents === true || agents.length > 0);

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

const sanitizeChartForDownload = (
    chart: ChartAsCode,
    stripPivotSeries: boolean,
): ChartAsCode =>
    stripPivotSeries
        ? {
              ...chart,
              chartConfig: removePivotedSeriesValuesFromChartConfig(
                  chart.chartConfig,
              ),
          }
        : chart;

const writeContent = async (
    contentAsCode: ContentAsCodeType,
    outputDir: string,
    languageMap: boolean,
    stripPivotSeries: boolean = false,
): Promise<MetadataEntry> => {
    const content =
        contentAsCode.type === 'chart'
            ? sanitizeChartForDownload(contentAsCode.content, stripPivotSeries)
            : contentAsCode.content;
    const extension = getFileExtension(contentAsCode.type);
    const itemPath = path.join(outputDir, `${content.slug}${extension}`);
    // Strip timestamps — they go to .lightdash-metadata.json instead
    const { updatedAt, downloadedAt, ...cleanContent } = content as
        | ChartAsCode
        | SqlChartAsCode
        | DashboardAsCode;
    const chartYml = yaml.dump(cleanContent, {
        quotingType: '"',
        sortKeys: true,
    });
    await fs.writeFile(itemPath, chartYml);

    if (contentAsCode.translationMap && languageMap) {
        const translationPath = path.join(
            outputDir,
            `${content.slug}.language.map.yml`,
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
        slug: content.slug,
        type: metadataType,
        downloadedAt: downloadedAtString,
    };
};

function getPromoteAction(action: PromotionAction) {
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
}

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
    !entry.name.endsWith('.space.yml') &&
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

    logContentAsCodeDiscovery(`Reading ${folder} from ${baseDir}`);

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
                    } else if (contentType === ContentAsCodeTypeEnum.SPACE) {
                        // Space files are handled by the dedicated space phase.
                    } else {
                        GlobalState.debug(
                            `Skipping ${file.name}: no recognized contentType`,
                        );
                    }
                } catch (e) {
                    GlobalState.log(
                        styles.warning(
                            `Skipping ${file.name}: failed to parse (${getErrorMessage(e)})`,
                        ),
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
    stripPivotSeries,
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
    stripPivotSeries: boolean;
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
            stripPivotSeries,
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
                endpoint: `/api/v1/projects/${projectId}/code/charts`,
                displayName: 'charts',
                supportsLanguageMap: true,
            };
        case 'dashboards':
            return {
                endpoint: `/api/v1/projects/${projectId}/code/dashboards`,
                displayName: 'dashboards',
                supportsLanguageMap: true,
            };
        case 'sqlCharts':
            return {
                endpoint: `/api/v1/projects/${projectId}/code/sqlCharts`,
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
    skipSpaces: boolean = false,
    stripPivotSeries: boolean = false,
    rootSpaces: boolean = false,
    onProgress?: (detail: string) => void,
): Promise<[number, string[], MetadataEntry[], SpaceAsCode[]]> => {
    const contentFilters = parseContentFilters(ids);
    const folderScheme: FolderScheme = nested ? 'nested' : 'flat';
    const config = getContentTypeConfig(type, projectId);

    let offset = 0;
    let total = 0;
    let chartSlugs: string[] = [];
    let allMetadataEntries: MetadataEntry[] = [];
    let allSpaces: SpaceAsCode[] = [];

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

        onProgress?.(
            `${results.offset} of ${results.total} ${config.displayName} downloaded`,
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
                    stripPivotSeries: false,
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
                    stripPivotSeries: false,
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
                    stripPivotSeries,
                });
                allMetadataEntries = [...allMetadataEntries, ...entries];
            }
        }

        // Accumulate space metadata from each page
        if ('spaces' in results && results.spaces) {
            allSpaces = [...allSpaces, ...results.spaces];
        }

        offset = results.offset;
        total = results.total;
    } while (offset < total);

    // Write space YAML files
    if (!skipSpaces) {
        const uniqueSpaces = [
            ...new Map(allSpaces.map((space) => [space.slug, space])).values(),
        ];
        await writeSpaceFiles(
            uniqueSpaces,
            projectName,
            customPath,
            folderScheme,
            rootSpaces ? 'root' : 'folder',
            true,
        );
    }

    return [total, [...new Set(chartSlugs)], allMetadataEntries, allSpaces];
};

const getScheduledDeliveriesFolder = (customPath?: string): string =>
    path.join(
        getDownloadFolder(customPath),
        SCHEDULED_DELIVERY_CODE_RESOURCE.folderName,
    );

const getAlertsFolder = (customPath?: string): string =>
    path.join(getDownloadFolder(customPath), ALERT_CODE_RESOURCE.folderName);

const getGoogleSheetsFolder = (customPath?: string): string =>
    path.join(
        getDownloadFolder(customPath),
        GOOGLE_SHEETS_CODE_RESOURCE.folderName,
    );

const downloadVirtualViews = async (
    projectId: string,
    slugs: string[],
    customPath?: string,
): Promise<number> => {
    const query = new URLSearchParams(
        slugs.map((slug) => ['slugs', slug] as [string, string]),
    ).toString();
    const results = await lightdashApi<
        ApiVirtualViewAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/code/virtualViews${
            query ? `?${query}` : ''
        }`,
        body: undefined,
    });
    await writeCodeResourceDocuments({
        definition: VIRTUAL_VIEW_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
        documents: results.virtualViews,
    });
    results.skipped.forEach(({ slug, reason }) =>
        GlobalState.log(
            styles.warning(`Skipped virtual view "${slug}": ${reason}`),
        ),
    );
    results.missingSlugs.forEach((slug) =>
        GlobalState.log(styles.warning(`Virtual view "${slug}" was not found`)),
    );
    return results.virtualViews.length;
};

const readVirtualViewFiles = async (
    customPath?: string,
): Promise<VirtualViewAsCode[]> => {
    const result = await readCodeResourceFiles({
        definition: VIRTUAL_VIEW_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
};

const upsertVirtualViews = async (
    projectId: string,
    slugs: string[],
    changes: Record<string, number>,
    force: boolean,
    canUpload: boolean,
    customPath?: string,
): Promise<Record<string, number>> => {
    const virtualViews = await readVirtualViewFiles(customPath);
    const selected = slugs.length
        ? virtualViews.filter(({ slug }) => slugs.includes(slug))
        : virtualViews;
    const selectedSlugs = new Set(selected.map(({ slug }) => slug));
    slugs
        .filter((slug) => !selectedSlugs.has(slug))
        .forEach((slug) =>
            GlobalState.log(
                styles.warning(`Virtual view "${slug}" was not found locally`),
            ),
        );
    if (selected.length > 0 && !canUpload) {
        GlobalState.log(
            styles.error(
                `Error uploading virtual views: the create:VirtualView permission is required`,
            ),
        );
        return changes;
    }
    for (const virtualView of selected.sort((left, right) =>
        left.slug.localeCompare(right.slug),
    )) {
        try {
            if (
                virtualView.version !== 1 ||
                !virtualView.slug?.trim() ||
                !virtualView.name?.trim() ||
                !virtualView.sql?.trim() ||
                !Array.isArray(virtualView.columns) ||
                virtualView.columns.length === 0 ||
                !Object.prototype.hasOwnProperty.call(virtualView, 'parameters')
            ) {
                throw new ParameterError(
                    `Invalid virtual view definition for "${virtualView.slug ?? 'unknown'}"`,
                );
            }

            const result = await lightdashApi<
                ApiVirtualViewAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/virtualViews/${encodeURIComponent(
                    virtualView.slug,
                )}?force=${force}`,
                body: JSON.stringify(virtualView),
            });
            const action = `virtual views ${getPromoteAction(result.action)}`;
            changes[action] = (changes[action] ?? 0) + 1;
        } catch (error) {
            const errorKey = 'virtual views with errors';
            changes[errorKey] = (changes[errorKey] ?? 0) + 1;
            GlobalState.log(
                styles.error(
                    `Error upserting virtual view:\n\t"${virtualView.name}" (slug: "${virtualView.slug}")\n\t${getErrorMessage(error)}`,
                ),
            );
        }
    }
    return changes;
};

type ScheduledContentAsCode =
    | ScheduledDeliveryAsCode
    | AlertAsCode
    | GoogleSheetsSyncAsCode;
type ScheduledContentType =
    | ContentAsCodeTypeEnum.SCHEDULED_DELIVERY
    | ContentAsCodeTypeEnum.ALERT
    | ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC;

const getScheduledContentConfig = (
    contentType: ScheduledContentType,
    customPath?: string,
) => {
    switch (contentType) {
        case ContentAsCodeTypeEnum.ALERT:
            return {
                folder: getAlertsFolder(customPath),
                definition: ALERT_CODE_RESOURCE,
                route: 'alerts',
                singular: 'alert',
                plural: 'alerts',
            };
        case ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC:
            return {
                folder: getGoogleSheetsFolder(customPath),
                definition: GOOGLE_SHEETS_CODE_RESOURCE,
                route: 'googleSheets',
                singular: 'Google Sheets sync',
                plural: 'Google Sheets syncs',
            };
        case ContentAsCodeTypeEnum.SCHEDULED_DELIVERY:
            return {
                folder: getScheduledDeliveriesFolder(customPath),
                definition: SCHEDULED_DELIVERY_CODE_RESOURCE,
                route: 'scheduledDeliveries',
                singular: 'scheduled delivery',
                plural: 'scheduled deliveries',
            };
        default:
            return assertUnreachable(
                contentType,
                'Unknown scheduled content type',
            );
    }
};

const downloadAiAgents = async (
    projectId: string,
    ids: string[],
    customPath?: string,
): Promise<number> => {
    const idQuery = ids.map((id) => ['ids', id] as [string, string]);
    let offset = 0;
    let total = 0;
    let downloaded = 0;
    const agents: AgentAsCode[] = [];

    do {
        const query = new URLSearchParams([
            ...idQuery,
            ['offset', String(offset)],
        ]).toString();
        const results = await lightdashApi<
            ApiAgentAsCodeListResponse['results']
        >({
            method: 'GET',
            url: `/api/v1/projects/${projectId}/code/aiAgents?${query}`,
            body: undefined,
        });

        agents.push(...results.agents);

        results.missingIds.forEach((id) =>
            GlobalState.debug(`No AI agent with id "${id}"`),
        );
        downloaded += results.agents.length;
        offset = results.offset;
        total = results.total;
    } while (offset < total);

    await writeCodeResourceDocuments({
        definition: AI_AGENT_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
        documents: agents,
    });

    return downloaded;
};

const readAiAgentFiles = async (
    customPath?: string,
): Promise<AgentAsCode[]> => {
    const result = await readCodeResourceFiles({
        definition: AI_AGENT_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
};

class AiAgentAsCodeUploadError extends Error {
    readonly originalError: Error;

    constructor(error: unknown) {
        const originalError =
            error instanceof Error ? error : new Error(getErrorMessage(error));
        super(originalError.message);
        this.name = 'AiAgentAsCodeUploadError';
        this.originalError = originalError;
    }
}

const upsertAiAgents = async (
    projectId: string,
    slugs: string[],
    changes: Record<string, number>,
    force: boolean,
    customPath?: string,
): Promise<Record<string, number>> => {
    const agents = await readAiAgentFiles(customPath);
    const filteredAgents = slugs.length
        ? agents.filter((agent) => slugs.includes(agent.slug))
        : agents;

    if (filteredAgents.length === 0) {
        if (slugs.length > 0) {
            GlobalState.log(
                styles.warning(`No matching AI agent files found, skipping`),
            );
        }
        return changes;
    }
    logContentAsCodeDiscovery(`Found ${filteredAgents.length} AI agent files`);

    const results = await lightdashApi<ApiAgentAsCodeUpsertResponse['results']>(
        {
            method: 'POST',
            url: `/api/v1/projects/${projectId}/code/aiAgents?force=${force}`,
            body: JSON.stringify({ agents: filteredAgents }),
        },
    );

    const counts = {
        'AI agents created': results.created.length,
        'AI agents updated': results.updated.length,
        'AI agents skipped': results.unchanged.length,
    };
    Object.entries(counts).forEach(([key, value]) => {
        if (value > 0) changes[key] = (changes[key] ?? 0) + value;
    });

    return changes;
};

const downloadScheduledContent = async (
    projectId: string,
    slugs: string[],
    contentType: ScheduledContentType,
    customPath?: string,
): Promise<number> => {
    const config = getScheduledContentConfig(contentType, customPath);
    await fs.mkdir(config.folder, { recursive: true });
    const query = new URLSearchParams(
        slugs.map((slug) => ['slugs', slug] as [string, string]),
    ).toString();
    const results = await lightdashApi<
        | ApiAlertAsCodeListResponse['results']
        | ApiGoogleSheetsSyncAsCodeListResponse['results']
        | ApiScheduledDeliveryAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/code/${config.route}${
            query ? `?${query}` : ''
        }`,
        body: undefined,
    });
    let scheduledContent: ScheduledContentAsCode[];
    if ('alerts' in results) {
        scheduledContent = results.alerts;
    } else if ('googleSheetsSyncs' in results) {
        scheduledContent = results.googleSheetsSyncs;
    } else {
        scheduledContent = results.scheduledDeliveries;
    }

    for (const item of scheduledContent) {
        const outputDir = path.join(
            config.folder,
            item.resource.type === 'chart' ? 'charts' : 'dashboards',
            item.resource.slug,
        );
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(
            path.join(outputDir, `${item.slug}.yml`),
            yaml.dump(item, { quotingType: '"', sortKeys: true }),
        );
    }

    results.skipped.forEach((item) =>
        GlobalState.debug(
            `Skipped ${config.singular} "${item.name}": ${item.reason}`,
        ),
    );

    return scheduledContent.length;
};

const readScheduledContentFiles = async (
    contentType: ScheduledContentType,
    customPath?: string,
): Promise<ScheduledContentAsCode[]> => {
    const read = async <Document extends ScheduledContentAsCode>(
        definition: CodeResourceDefinition<Document>,
    ): Promise<Document[]> => {
        const result = await readCodeResourceFiles({
            definition,
            basePath: getDownloadFolder(customPath),
        });
        assertCodeResourceFilesValid(result);
        return result.files.map(({ document }) => document);
    };

    switch (contentType) {
        case ContentAsCodeTypeEnum.ALERT:
            return read(ALERT_CODE_RESOURCE);
        case ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC:
            return read(GOOGLE_SHEETS_CODE_RESOURCE);
        case ContentAsCodeTypeEnum.SCHEDULED_DELIVERY:
            return read(SCHEDULED_DELIVERY_CODE_RESOURCE);
        default:
            return assertUnreachable(
                contentType,
                'Unknown scheduled content type',
            );
    }
};

const upsertScheduledContent = async (
    projectId: string,
    slugs: string[],
    changes: Record<string, number>,
    force: boolean,
    contentType: ScheduledContentType,
    canUpload: boolean,
    customPath?: string,
): Promise<Record<string, number>> => {
    const config = getScheduledContentConfig(contentType, customPath);
    const scheduledContent = await readScheduledContentFiles(
        contentType,
        customPath,
    );
    logContentAsCodeDiscovery(
        `Found ${scheduledContent.length} ${config.singular} files`,
    );
    const filteredContent = slugs.length
        ? scheduledContent.filter((item) => slugs.includes(item.slug))
        : scheduledContent;

    if (filteredContent.length > 0 && !canUpload) {
        const requiredPermission =
            contentType === ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC
                ? 'the manage:GoogleSheets permission is required'
                : 'scheduled delivery permissions are required';
        GlobalState.log(
            styles.error(
                `Error uploading ${config.plural}: ${requiredPermission}`,
            ),
        );
        return changes;
    }

    for (const item of filteredContent) {
        try {
            const result = await lightdashApi<
                | ApiAlertAsCodeUpsertResponse['results']
                | ApiGoogleSheetsSyncAsCodeUpsertResponse['results']
                | ApiScheduledDeliveryAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/${config.route}/${item.slug}?force=${force}`,
                body: JSON.stringify(item),
            });
            const action = getPromoteAction(result.action);
            const key = `${config.plural} ${action}`;
            changes[key] = (changes[key] ?? 0) + 1;
        } catch (error) {
            const errorKey = `${config.plural} with errors`;
            changes[errorKey] = (changes[errorKey] ?? 0) + 1;
            GlobalState.log(
                styles.error(
                    `Error upserting ${config.singular} "${item.name}" (${item.resource.type}: ${item.resource.slug}): ${getErrorMessage(error)}`,
                ),
            );
        }
    }

    return changes;
};

// Space-scoped fallback listing for servers without the project-wide apps
// endpoint; omits apps that were never added to a space.
const listAppUuidsViaContentApi = async (
    projectId: string,
): Promise<string[]> => {
    const listedAppUuids: string[] = [];
    let page = 1;
    let totalPageCount = 1;
    do {
        const contentResult = await lightdashApi<ApiContentResponse['results']>(
            {
                method: 'GET',
                url: `/api/v2/content?projectUuids=${projectId}&contentTypes=data_app&page=${page}&pageSize=100`,
                body: undefined,
            },
        );
        listedAppUuids.push(
            ...contentResult.data
                .filter((item) => item.contentType === 'data_app')
                .map((item) => item.uuid),
        );
        totalPageCount = contentResult.pagination?.totalPageCount ?? 1;
        page += 1;
    } while (page <= totalPageCount);
    return listedAppUuids;
};

export const downloadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);

    const isOrganizationDownload = options.organization === true;

    const includeAll = options.includeAll === true;
    const includeApps =
        !options.spacesOnly && (options.includeApps === true || includeAll);
    const includeAllOptionalContent =
        includeAll && !options.appsOnly && !options.spacesOnly;
    const { limit: appsLimit, noEffectWarning: appsLimitWarning } =
        resolveAppsLimit(options.appsLimit, includeApps);
    if (appsLimitWarning) {
        GlobalState.log(styles.warning(appsLimitWarning));
    }

    if (options.appsOnly) {
        const appsOnlySelection = selectAppsToDownload({
            apps: Array.isArray(options.apps) ? options.apps : undefined,
            includeApps,
        });
        if (appsOnlySelection.mode === 'none') {
            throw new ParameterError(
                'Nothing to download: --apps-only requires --apps <appUuids...>, --include-apps, or --include-all.',
            );
        }
        options.skipCharts = true;
        options.skipDashboards = true;
        options.skipSpaces = true;
        options.includeAgents = false;
        options.includeAlerts = false;
        options.includeGoogleSheets = false;
        options.includeScheduledDeliveries = false;
        options.includeVirtualViews = false;
    }

    if (options.spacesOnly) {
        if (options.skipSpaces) {
            throw new ParameterError(
                'Nothing to download: --spaces-only cannot be combined with --skip-spaces.',
            );
        }
        options.skipCharts = true;
        options.skipDashboards = true;
        options.agents = [];
        options.alerts = [];
        options.apps = [];
        options.googleSheets = [];
        options.scheduledDeliveries = [];
        options.virtualViews = [];
        options.includeAgents = false;
        options.includeApps = false;
        options.includeAlerts = false;
        options.includeGoogleSheets = false;
        options.includeScheduledDeliveries = false;
        options.includeVirtualViews = false;
    }

    if (options.rootSpaces && options.nested) {
        throw new ParameterError(
            '--root-spaces cannot be combined with --nested',
        );
    }

    const hasFilters =
        !options.spacesOnly &&
        (options.charts.length > 0 ||
            options.dashboards.length > 0 ||
            options.agents.length > 0 ||
            options.alerts.length > 0 ||
            options.googleSheets.length > 0 ||
            options.scheduledDeliveries.length > 0 ||
            options.virtualViews.length > 0);
    const shouldDownloadSpaces =
        !isOrganizationDownload && !options.skipSpaces && !hasFilters;
    let skipEmbeddedSpaces = !hasFilters || options.skipSpaces;
    if (shouldDownloadSpaces) {
        try {
            await getUniqueExistingSpaceFilePathsBySlug(
                getDownloadFolder(options.path),
            );
        } catch (error) {
            throw createSpaceAsCodeDownloadError(getErrorMessage(error));
        }
    }

    await checkLightdashVersion();

    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    if (isOrganizationDownload) {
        await downloadOrganizationContent({
            customPath: options.path,
            config,
        });
        return;
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
    const output = createContentAsCodeOutput({
        operation: 'download',
        scope: 'project',
    });
    try {
        let allMetadataEntries: MetadataEntry[] = [];

        if (shouldDownloadSpaces) {
            output.startItem('Spaces');
            try {
                const spaceTotal = await downloadSpaces(
                    projectId,
                    projectName,
                    options.path,
                    options.nested,
                    options.rootSpaces,
                );
                output.completeItem(`${spaceTotal} downloaded`);
            } catch (error) {
                if (
                    !shouldFallBackToEmbeddedSpaces(error, options.spacesOnly)
                ) {
                    throw isSpaceAsCodeFetchError(error)
                        ? createSpaceAsCodeDownloadError(getErrorMessage(error))
                        : error;
                }
                skipEmbeddedSpaces = false;
                output.completeItem(
                    'access unavailable; using legacy metadata',
                    'warning',
                );
                GlobalState.log(
                    styles.warning(
                        'Space access is unavailable; continuing with legacy space metadata where available.',
                    ),
                );
                GlobalState.debug(
                    `Could not download access-aware spaces: ${getErrorMessage(error)}`,
                );
            }
        }

        if (
            includeAllOptionalContent ||
            options.includeVirtualViews ||
            options.virtualViews.length > 0
        ) {
            await output.runItem({
                label: 'Virtual views',
                action: () =>
                    downloadVirtualViews(
                        projectId,
                        options.virtualViews,
                        options.path,
                    ),
                detail: (total) => `${total} downloaded`,
            });
        }

        // Download regular charts and SQL charts
        if (!options.skipCharts) {
            if (hasFilters && options.charts.length === 0) {
                GlobalState.log(
                    styles.warning(`No charts filters provided, skipping`),
                );
            } else {
                const [regularChartTotal, , regularChartMeta] =
                    await output.runItem({
                        label: 'Charts',
                        action: () =>
                            downloadContent(
                                options.charts,
                                'charts',
                                projectId,
                                projectName,
                                options.path,
                                options.languageMap,
                                options.nested,
                                skipEmbeddedSpaces,
                                options.stripPivotSeries,
                                options.rootSpaces,
                                output.updateActive,
                            ),
                        detail: ([total]) => `${total} downloaded`,
                    });
                allMetadataEntries = [
                    ...allMetadataEntries,
                    ...regularChartMeta,
                ];

                const [sqlChartTotal, , sqlChartMeta] = await output.runItem({
                    label: 'SQL charts',
                    action: () =>
                        downloadContent(
                            options.charts,
                            'sqlCharts',
                            projectId,
                            projectName,
                            options.path,
                            options.languageMap,
                            options.nested,
                            skipEmbeddedSpaces,
                            false,
                            options.rootSpaces,
                            output.updateActive,
                        ),
                    detail: ([total]) => `${total} downloaded`,
                });
                allMetadataEntries = [...allMetadataEntries, ...sqlChartMeta];

                chartTotal = regularChartTotal + sqlChartTotal;
            }
        }

        // Download dashboards
        if (!options.skipDashboards) {
            if (hasFilters && options.dashboards.length === 0) {
                GlobalState.log(
                    styles.warning(`No dashboards filters provided, skipping`),
                );
            } else {
                let chartSlugs: string[] = [];

                let dashMeta: MetadataEntry[];
                [dashboardTotal, chartSlugs, dashMeta] = await output.runItem({
                    label: 'Dashboards',
                    action: () =>
                        downloadContent(
                            options.dashboards,
                            'dashboards',
                            projectId,
                            projectName,
                            options.path,
                            options.languageMap,
                            options.nested,
                            skipEmbeddedSpaces,
                            false,
                            options.rootSpaces,
                            output.updateActive,
                        ),
                    detail: ([total]) => `${total} downloaded`,
                });
                allMetadataEntries = [...allMetadataEntries, ...dashMeta];

                if (
                    hasFilters &&
                    chartSlugs.length > 0 &&
                    !options.skipCharts
                ) {
                    output.startItem('Linked charts');
                    output.updateActive(
                        `${chartSlugs.length} dashboard dependencies`,
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
                            skipEmbeddedSpaces,
                            options.stripPivotSeries,
                            options.rootSpaces,
                            output.updateActive,
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
                        skipEmbeddedSpaces,
                        false,
                        options.rootSpaces,
                        output.updateActive,
                    );
                    allMetadataEntries = [
                        ...allMetadataEntries,
                        ...linkedSqlMeta,
                    ];

                    output.completeItem(
                        `${regularCharts + sqlCharts} downloaded`,
                    );
                }
            }
        }

        if (!options.spacesOnly && shouldDownloadAiAgents(options)) {
            await output.runItem({
                label: 'AI agents',
                action: () =>
                    downloadAiAgents(projectId, options.agents, options.path),
                detail: (total) => `${total} downloaded`,
            });
        }

        if (
            includeAllOptionalContent ||
            options.includeAlerts ||
            options.alerts.length > 0
        ) {
            await output.runItem({
                label: 'Alerts',
                action: () =>
                    downloadScheduledContent(
                        projectId,
                        options.alerts,
                        ContentAsCodeTypeEnum.ALERT,
                        options.path,
                    ),
                detail: (total) => `${total} downloaded`,
            });
        }

        if (
            includeAllOptionalContent ||
            options.includeScheduledDeliveries ||
            options.scheduledDeliveries.length > 0
        ) {
            await output.runItem({
                label: 'Scheduled deliveries',
                action: () =>
                    downloadScheduledContent(
                        projectId,
                        options.scheduledDeliveries,
                        ContentAsCodeTypeEnum.SCHEDULED_DELIVERY,
                        options.path,
                    ),
                detail: (total) => `${total} downloaded`,
            });
        }

        if (
            includeAllOptionalContent ||
            options.includeGoogleSheets ||
            options.googleSheets.length > 0
        ) {
            await output.runItem({
                label: 'Google Sheets syncs',
                action: () =>
                    downloadScheduledContent(
                        projectId,
                        options.googleSheets,
                        ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC,
                        options.path,
                    ),
                detail: (total) => `${total} downloaded`,
            });
        }

        // Download data apps (enterprise, opt-in via --apps / --include-apps / --include-all)
        const appsSelection = selectAppsToDownload({
            apps: Array.isArray(options.apps) ? options.apps : undefined,
            includeApps,
        });

        if (appsSelection.mode !== 'none') {
            output.startItem('Data apps');
            let appUuidsToDownload: string[];
            let appListingError: string | null = null;

            if (appsSelection.mode === 'explicit') {
                appUuidsToDownload = appsSelection.appUuids;
            } else {
                // List every app in the project (includes apps not in any space)
                output.updateActive('listing project apps…');
                let listedAppUuids: string[];
                try {
                    const projectApps = await lightdashApi<
                        ApiEmbedProjectAppsResponse['results']
                    >({
                        method: 'GET',
                        url: `/api/v1/ee/projects/${projectId}/apps`,
                        body: undefined,
                    });
                    listedAppUuids = projectApps.map((app) => app.appUuid);
                } catch (listErr) {
                    if (!shouldFallBackToSpaceScopedListing(listErr)) {
                        if (!includeAllOptionalContent) {
                            throw listErr;
                        }
                        appListingError = getErrorMessage(listErr);
                        listedAppUuids = [];
                    } else {
                        GlobalState.log(
                            styles.warning(
                                'This server does not support project-wide app listing; only apps that are in a space will be included.',
                            ),
                        );
                        listedAppUuids =
                            await listAppUuidsViaContentApi(projectId);
                    }
                }

                const { appUuids: cappedAppUuids, truncatedCount } =
                    capListedApps(listedAppUuids, appsLimit);
                if (truncatedCount > 0) {
                    GlobalState.log(
                        styles.warning(
                            `Found ${listedAppUuids.length} data apps, downloading the first ${appsLimit}. Pass --apps-limit <n> to raise the cap.`,
                        ),
                    );
                }
                appUuidsToDownload = [
                    ...new Set([
                        ...cappedAppUuids,
                        ...appsSelection.extraAppUuids,
                    ]),
                ];
            }

            if (appUuidsToDownload.length === 0) {
                if (appListingError === null) {
                    output.completeItem('0 found');
                } else {
                    output.completeItem(
                        `listing failed: ${appListingError}`,
                        'warning',
                    );
                }
            } else {
                output.updateActive(
                    `0 of ${appUuidsToDownload.length} downloaded`,
                );
                const baseDir = getDownloadFolder(options.path);
                const appsDir = path.join(baseDir, 'apps');
                const takenFolders = new Set<string>();
                let appSuccessCount = 0;
                let appSkippedNotBuiltCount = 0;
                const appFailures: AppDownloadFailure[] = [];

                for (const appUuid of appUuidsToDownload) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const code = ensureDownloadedAppContext(
                            appUuid,
                            await lightdashApi<DataAppCodeDownload>({
                                method: 'GET',
                                url: `/api/v1/ee/projects/${projectId}/apps/${appUuid}/download`,
                                body: undefined,
                            }),
                        );

                        const folder = appFolderName(
                            code.manifest.name,
                            appUuid,
                            takenFolders,
                        );
                        takenFolders.add(folder);

                        const appDir = path.join(appsDir, folder);
                        const manifest = {
                            ...code.manifest,
                            scaffoldingVersion: CLI_VERSION,
                        };
                        // eslint-disable-next-line no-await-in-loop
                        await writeBundleToDir(appDir, { ...code, manifest });
                        // eslint-disable-next-line no-await-in-loop
                        await writeFilesToDir(
                            appDir,
                            buildStaticAuthoringFiles({
                                appName: code.manifest.name,
                                sdkVersion: CLI_VERSION,
                            }),
                        );
                        // Server-provided deps override the scaffold's
                        // template package.json so re-uploads round-trip.
                        if (code.dependencies) {
                            // eslint-disable-next-line no-await-in-loop
                            await writeDependenciesToDir(
                                appDir,
                                code.dependencies,
                            );
                        }
                        // eslint-disable-next-line no-await-in-loop
                        await writeContextToDir(appDir, code.context);
                        appSuccessCount += 1;
                    } catch (appErr) {
                        const outcome = classifyAppDownloadError(appErr);
                        if (outcome.kind === 'skip-not-built') {
                            appSkippedNotBuiltCount += 1;
                            GlobalState.debug(
                                `> Skipped app ${appUuid}: no built version to download`,
                            );
                        } else {
                            appFailures.push({
                                appUuid,
                                message: outcome.message,
                            });
                            GlobalState.log(
                                styles.error(
                                    `Failed to download app ${appUuid}: ${outcome.message}`,
                                ),
                            );
                        }
                    }
                    output.updateActive(
                        `${
                            appSuccessCount +
                            appSkippedNotBuiltCount +
                            appFailures.length
                        } of ${appUuidsToDownload.length} processed`,
                    );
                }

                const summary = appsDownloadSummary(
                    appSuccessCount,
                    appUuidsToDownload.length,
                    appFailures,
                    appsDir,
                    appSkippedNotBuiltCount,
                );
                output.completeItem(
                    `${appSuccessCount} downloaded${
                        appSkippedNotBuiltCount > 0
                            ? `, ${appSkippedNotBuiltCount} skipped`
                            : ''
                    }${
                        appFailures.length > 0
                            ? `, ${appFailures.length} failed`
                            : ''
                    }`,
                    summary.ok ? undefined : 'warning',
                );
                if (!summary.ok) {
                    summary.failureLines.forEach((line) =>
                        GlobalState.log(styles.warning(line)),
                    );
                }
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
        output.startItem('Metadata');
        await writeMetadataFile(baseDir, metadataToWrite);
        if (!config.answers?.metadataFileGitignoreNoticeShown) {
            GlobalState.log(
                styles.warning(
                    `\nNote: ${METADATA_FILENAME} was written to ${baseDir}. Consider adding it to your .gitignore.`,
                ),
            );
            await setAnswer({ metadataFileGitignoreNoticeShown: true });
        }
        output.completeItem('timestamps written');
        const end = Date.now();
        const renderedSummary = output.complete(
            downloadRoot,
            (end - start) / 1000,
        );
        if (!renderedSummary) {
            GlobalState.log(
                styles.success(`Downloaded content saved to ${downloadRoot}`),
            );
        }

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
        output.fail(getErrorMessage(error), (Date.now() - start) / 1000, true);
        await LightdashAnalytics.track({
            event: 'download.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: `${error}`,
            },
        });
        if (isSpaceAsCodeDownloadError(error)) throw error;
    }
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

const UPLOAD_CHANGE_SUFFIXES = [
    'dependency skipped',
    'with errors',
    'unchanged',
    'created',
    'updated',
    'deleted',
    'skipped',
    'failed',
] as const;

const summarizeUploadChanges = (
    before: Record<string, number>,
    after: Record<string, number>,
): { detail: string; variant?: ContentAsCodeOutputVariant } => {
    const totals = new Map<string, number>();
    Object.entries(after).forEach(([key, value]) => {
        const difference = value - (before[key] ?? 0);
        if (difference <= 0) return;
        const suffix = UPLOAD_CHANGE_SUFFIXES.find((candidate) =>
            key.endsWith(candidate),
        );
        const label = suffix ?? 'processed';
        totals.set(label, (totals.get(label) ?? 0) + difference);
    });

    if (totals.size === 0) return { detail: 'no changes' };
    const detail = [...totals]
        .map(([label, total]) => `${total} ${label}`)
        .join(', ');
    const hasFailures = [...totals.keys()].some(
        (label) => label === 'with errors' || label === 'failed',
    );
    return { detail, variant: hasFailures ? 'warning' : undefined };
};

const runUploadChangesPhase = async ({
    output,
    label,
    changes,
    action,
}: {
    output: ContentAsCodeOutput;
    label: string;
    changes: Record<string, number>;
    action: () => Promise<Record<string, number>>;
}): Promise<Record<string, number>> => {
    const before = { ...changes };
    output.startItem(label);
    const updatedChanges = await action();
    const summary = summarizeUploadChanges(before, updatedChanges);
    output.completeItem(summary.detail, summary.variant);
    return updatedChanges;
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
    spaceNames?: Record<string, string>,
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
            ? `/api/v1/projects/${projectId}/code/sqlCharts/${item.slug}`
            : `/api/v1/projects/${projectId}/code/${type}/${item.slug}`;

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
                ...(spaceNames &&
                    Object.keys(spaceNames).length > 0 && { spaceNames }),
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
    canUpload: boolean,
    customPath?: string,
    skipSpaceCreate?: boolean,
    publicSpaceCreate?: boolean,
    validate?: boolean,
    concurrency: number = 1,
    extraItems: (T & { needsUpdating: boolean })[] = [],
    spaceNames?: Record<string, string>,
): Promise<{ changes: Record<string, number>; total: number }> => {
    const config = await getConfig();

    const folderItems = await readCodeFiles<T>(type, customPath);
    const items = [...folderItems, ...extraItems];

    logContentAsCodeDiscovery(`Found ${items.length} ${type} files`);

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

    if (filteredItems.length > 0 && !canUpload) {
        const requiredPermission =
            type === 'charts' ? 'manage:SavedChart' : 'manage:Dashboard';
        GlobalState.log(
            styles.error(
                `Error uploading ${type}: the ${requiredPermission} permission is required`,
            ),
        );
        return { changes, total: filteredItems.length };
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
                spaceNames,
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
                spaceNames,
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
                        spaceNames,
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
    looseDashboards: (DashboardAsCode & { needsUpdating: boolean })[] = [],
) => {
    const folderDashboards = await readCodeFiles<DashboardAsCode>(
        'dashboards',
        customPath,
    );
    const dashboardItems = [...folderDashboards, ...looseDashboards];

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

    if (options.spacesOnly && options.skipSpaces) {
        throw new ParameterError(
            'Nothing to upload: --spaces-only cannot be combined with --skip-spaces.',
        );
    }

    const isOrganizationUpload = options.organization === true;
    const hasFilters =
        !options.spacesOnly &&
        (options.charts.length > 0 ||
            options.dashboards.length > 0 ||
            options.agents.length > 0 ||
            options.alerts.length > 0 ||
            options.googleSheets.length > 0 ||
            options.scheduledDeliveries.length > 0 ||
            options.virtualViews.length > 0);
    const shouldReconcileSpaces =
        !isOrganizationUpload && !options.skipSpaces && !hasFilters;
    let preflightSpaceFiles: SpaceCodeFile[] = [];
    if (shouldReconcileSpaces) {
        try {
            preflightSpaceFiles = await readSpaceFiles(options.path);
        } catch (error) {
            throw createSpaceAsCodeUploadError(getErrorMessage(error));
        }
    }

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

    if (isOrganizationUpload) {
        await uploadOrganizationContent({
            customPath: options.path,
            config,
            sendInvites: options.sendInvites,
        });
        return;
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
    const output = createContentAsCodeOutput({
        operation: 'upload',
        scope: 'project',
    });
    const uploadRoot = getDownloadFolder(options.path);
    const completeUpload = () => {
        const renderedSummary = output.complete(
            uploadRoot,
            (Date.now() - start) / 1000,
        );
        if (!renderedSummary) {
            logUploadChanges(changes);
            GlobalState.log(
                styles.success(`Uploaded content from ${uploadRoot}`),
            );
        }
    };

    try {
        const spaceFiles = preflightSpaceFiles;
        const spaceNames = shouldReconcileSpaces
            ? getSpaceNames(spaceFiles)
            : await readSpaceNames(options.path);
        if (spaceFiles.length > 0) {
            logContentAsCodeDiscovery(
                `Found ${spaceFiles.length} space definition(s)`,
            );
        }

        if (shouldReconcileSpaces) {
            changes = await runUploadChangesPhase({
                output,
                label: 'Spaces',
                changes,
                action: () =>
                    upsertSpaces(
                        projectId,
                        spaceFiles,
                        changes,
                        options.skipSpaceCreate,
                        options.public,
                        options.skipSpaceAccess,
                    ),
            });
        } else if (hasFilters) {
            GlobalState.debug(
                'Skipping space access reconciliation for a filtered content upload',
            );
        }

        if (options.spacesOnly) {
            await LightdashAnalytics.track({
                event: 'upload.completed',
                properties: {
                    userId: config.user?.userUuid,
                    organizationId: config.user?.organizationUuid,
                    projectId,
                    timeToCompleted: (Date.now() - start) / 1000,
                },
            });
            completeUpload();
            return;
        }

        const uploadPermissions =
            await getContentAsCodeUploadPermissions(projectId);

        // Discover loose YAML files (outside charts/ and dashboards/) classified by contentType
        const looseFiles = await output.runItem({
            label: 'Content files',
            action: () => readLooseCodeFiles(options.path),
            detail: ({ charts, dashboards }) =>
                `${charts.length + dashboards.length} discovered`,
        });
        if (looseFiles.charts.length > 0) {
            logContentAsCodeDiscovery(
                `Found ${looseFiles.charts.length} chart(s) outside charts/ directory (classified by contentType)`,
            );
        }
        if (looseFiles.dashboards.length > 0) {
            logContentAsCodeDiscovery(
                `Found ${looseFiles.dashboards.length} dashboard(s) outside dashboards/ directory (classified by contentType)`,
            );
        }

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

        if (!options.skipVirtualViews) {
            if (hasFilters && options.virtualViews.length === 0) {
                GlobalState.log(
                    styles.warning(
                        `No virtual view filters provided, skipping`,
                    ),
                );
            } else {
                changes = await runUploadChangesPhase({
                    output,
                    label: 'Virtual views',
                    changes,
                    action: () =>
                        upsertVirtualViews(
                            projectId,
                            options.virtualViews,
                            changes,
                            options.force,
                            uploadPermissions.virtualViews,
                            options.path,
                        ),
                });
            }
        }

        changes = await runUploadChangesPhase({
            output,
            label: 'Charts',
            changes,
            action: async () => {
                const chartSlugs = options.includeCharts
                    ? Array.from(
                          new Set([
                              ...options.charts,
                              ...(await getDashboardChartSlugs(
                                  options.dashboards,
                                  options.path,
                                  looseFiles.dashboards,
                              )),
                          ]),
                      )
                    : options.charts;
                if (hasFilters && chartSlugs.length === 0) {
                    GlobalState.log(
                        styles.warning(`No charts filters provided, skipping`),
                    );
                    return changes;
                }
                const result = await upsertResources<ChartAsCode>(
                    'charts',
                    projectId,
                    changes,
                    options.force,
                    chartSlugs,
                    uploadPermissions.charts,
                    options.path,
                    options.skipSpaceCreate,
                    options.public,
                    options.validate,
                    concurrency,
                    looseFiles.charts,
                    spaceNames,
                );
                chartTotal = result.total;
                return result.changes;
            },
        });

        changes = await runUploadChangesPhase({
            output,
            label: 'Dashboards',
            changes,
            action: async () => {
                if (hasFilters && options.dashboards.length === 0) {
                    GlobalState.log(
                        styles.warning(
                            `No dashboard filters provided, skipping`,
                        ),
                    );
                    return changes;
                }
                const result = await upsertResources<DashboardAsCode>(
                    'dashboards',
                    projectId,
                    changes,
                    options.force,
                    options.dashboards,
                    uploadPermissions.dashboards,
                    options.path,
                    options.skipSpaceCreate,
                    options.public,
                    options.validate,
                    concurrency,
                    looseFiles.dashboards,
                    spaceNames,
                );
                dashboardTotal = result.total;
                return result.changes;
            },
        });

        if (!options.skipAgents) {
            if (hasFilters && options.agents.length === 0) {
                GlobalState.log(
                    styles.warning(`No AI agent filters provided, skipping`),
                );
            } else {
                try {
                    changes = await runUploadChangesPhase({
                        output,
                        label: 'AI agents',
                        changes,
                        action: () =>
                            upsertAiAgents(
                                projectId,
                                options.agents,
                                changes,
                                options.force,
                                options.path,
                            ),
                    });
                } catch (error) {
                    throw new AiAgentAsCodeUploadError(error);
                }
            }
        }

        if (!options.skipAlerts) {
            if (hasFilters && options.alerts.length === 0) {
                GlobalState.log(
                    styles.warning(`No alert filters provided, skipping`),
                );
            } else {
                changes = await runUploadChangesPhase({
                    output,
                    label: 'Alerts',
                    changes,
                    action: () =>
                        upsertScheduledContent(
                            projectId,
                            options.alerts,
                            changes,
                            options.force,
                            ContentAsCodeTypeEnum.ALERT,
                            uploadPermissions.alerts,
                            options.path,
                        ),
                });
            }
        }

        if (!options.skipScheduledDeliveries) {
            if (hasFilters && options.scheduledDeliveries.length === 0) {
                GlobalState.log(
                    styles.warning(
                        `No scheduled delivery filters provided, skipping`,
                    ),
                );
            } else {
                changes = await runUploadChangesPhase({
                    output,
                    label: 'Scheduled deliveries',
                    changes,
                    action: () =>
                        upsertScheduledContent(
                            projectId,
                            options.scheduledDeliveries,
                            changes,
                            options.force,
                            ContentAsCodeTypeEnum.SCHEDULED_DELIVERY,
                            uploadPermissions.scheduledDeliveries,
                            options.path,
                        ),
                });
            }
        }

        if (!options.skipGoogleSheets) {
            if (hasFilters && options.googleSheets.length === 0) {
                GlobalState.log(
                    styles.warning(
                        `No Google Sheets sync filters provided, skipping`,
                    ),
                );
            } else {
                changes = await runUploadChangesPhase({
                    output,
                    label: 'Google Sheets syncs',
                    changes,
                    action: () =>
                        upsertScheduledContent(
                            projectId,
                            options.googleSheets,
                            changes,
                            options.force,
                            ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC,
                            uploadPermissions.googleSheets,
                            options.path,
                        ),
                });
            }
        }

        // Upload data apps (enterprise, opt-in via --apps <uuids...> or
        // --include-apps, fire-and-forget)
        const explicitAppUuids = Array.isArray(options.apps)
            ? options.apps
            : [];
        const shouldUploadApps =
            options.includeApps === true || explicitAppUuids.length > 0;

        let appsCreated = 0;
        let appsUpdated = 0;
        let appsFailed = 0;
        let appsSkipped = 0;
        const changesBeforeApps = { ...changes };

        if (shouldUploadApps && !uploadPermissions.dataApps) {
            output.startItem('Data apps');
            GlobalState.log(
                styles.error(
                    `Error uploading data apps: create:DataApp or manage:DataApp permission is required`,
                ),
            );
            output.completeItem('permission denied', 'warning');
        } else if (shouldUploadApps) {
            output.startItem('Data apps');
            // --include-apps uploads every folder on disk; explicit UUIDs
            // filter folders by their manifest appUuid
            const filterUuids: Set<string> | null =
                options.includeApps === true ? null : new Set(explicitAppUuids);

            const baseDir = getDownloadFolder(options.path);
            const appsDir = path.join(baseDir, 'apps');

            let appFolderEntries: import('fs').Dirent[];
            try {
                appFolderEntries = await fs.readdir(appsDir, {
                    withFileTypes: true,
                });
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                    GlobalState.log(
                        styles.warning(
                            `No apps directory found at ${appsDir}. Run 'lightdash download --include-apps' first.`,
                        ),
                    );
                    appFolderEntries = [];
                } else {
                    throw err;
                }
            }

            const subDirs = appFolderEntries.filter((e) => e.isDirectory());

            if (subDirs.length === 0) {
                GlobalState.log(
                    styles.warning(`No app folders found in ${appsDir}.`),
                );
            }

            for (const subDir of subDirs) {
                const folderPath = path.join(appsDir, subDir.name);
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const code = await readBundleFromDir(folderPath);

                    if (
                        filterUuids &&
                        !filterUuids.has(code.manifest.appUuid)
                    ) {
                        GlobalState.debug(
                            `Skipping app folder "${subDir.name}" (uuid ${code.manifest.appUuid} not in filter)`,
                        );
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    // Guard: cross-project create
                    const uploadDecision = classifyAppUpload(
                        code.manifest.projectUuid,
                        projectId,
                        options.createNew === true,
                    );

                    if (uploadDecision === 'needs-confirmation') {
                        if (process.stdin.isTTY && process.stdout.isTTY) {
                            // eslint-disable-next-line no-await-in-loop
                            const { confirmed } = await inquirer.prompt<{
                                confirmed: boolean;
                            }>([
                                {
                                    type: 'confirm',
                                    name: 'confirmed',
                                    message: `"${subDir.name}" was downloaded from project ${code.manifest.projectUuid}, but you are uploading to project ${projectId}. This will CREATE a new app. Continue?`,
                                    default: false,
                                },
                            ]);
                            if (!confirmed) {
                                GlobalState.log(
                                    `Skipped "${subDir.name}" (cross-project create declined). Pass --create-new to make this explicit. If this app was already moved to the target project, set appUuid and projectUuid in lightdash-app.yml to the moved app instead.`,
                                );
                                appsSkipped += 1;
                                // eslint-disable-next-line no-continue
                                continue;
                            }
                        } else {
                            GlobalState.log(
                                styles.error(
                                    `Cannot upload "${subDir.name}": its manifest targets project ${code.manifest.projectUuid} but you are uploading to project ${projectId}. Pass --create-new to create a new app in the target project. If this app was already moved there, set appUuid and projectUuid in lightdash-app.yml to the moved app instead.`,
                                ),
                            );
                            appsFailed += 1;
                            // eslint-disable-next-line no-continue
                            continue;
                        }
                    }

                    // Read declared dependencies from the app folder (optional).
                    // eslint-disable-next-line no-await-in-loop
                    const rawDeps = await readDependenciesFromDir(folderPath);
                    let codeToUpload = code;

                    if (rawDeps !== null) {
                        const templateDeps = applySdkMirrorToTemplateDeps(
                            loadTemplateDependencies(CLI_VERSION),
                            rawDeps.packageJson,
                        );
                        let customDeps: Record<string, string>;
                        try {
                            // No lockfile on disk (the scaffold writes a
                            // package.json but never a lockfile): compute the
                            // custom set without the lockfile checks. Whether
                            // that's acceptable is decided below.
                            customDeps =
                                rawDeps.lockfile === null
                                    ? computeCustomDependencies(
                                          rawDeps.packageJson,
                                          templateDeps,
                                      )
                                    : validateDataAppDependencies(
                                          {
                                              packageJson: rawDeps.packageJson,
                                              lockfile: rawDeps.lockfile,
                                          },
                                          {
                                              templateDependencies:
                                                  templateDeps,
                                          },
                                      ).customDeps;
                        } catch (depsErr) {
                            GlobalState.log(
                                styles.error(
                                    `Skipping "${subDir.name}": declared dependencies are invalid — ${getErrorMessage(depsErr)}`,
                                ),
                            );
                            appsFailed += 1;
                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        if (Object.keys(customDeps).length > 0) {
                            if (rawDeps.lockfile === null) {
                                GlobalState.log(
                                    styles.error(
                                        `Skipping "${subDir.name}": it declares custom dependencies but has no pnpm-lock.yaml. Run 'pnpm install' in the app folder to generate one, then upload again.`,
                                    ),
                                );
                                appsFailed += 1;
                                // eslint-disable-next-line no-continue
                                continue;
                            }
                            const warningLines = buildDepsWarningLines(
                                customDeps,
                                templateDeps,
                            );
                            GlobalState.log(
                                styles.warning(
                                    `"${subDir.name}" declares custom dependencies that will be installed in the build sandbox:`,
                                ),
                            );
                            warningLines.forEach((line) =>
                                GlobalState.log(line),
                            );

                            if (process.stdin.isTTY && process.stdout.isTTY) {
                                // eslint-disable-next-line no-await-in-loop
                                const { proceed } = await inquirer.prompt<{
                                    proceed: boolean;
                                }>([
                                    {
                                        type: 'confirm',
                                        name: 'proceed',
                                        message: `Upload "${subDir.name}" with custom dependencies?`,
                                        default: true,
                                    },
                                ]);
                                if (!proceed) {
                                    GlobalState.log(
                                        `Skipped "${subDir.name}" (custom dependency upload declined).`,
                                    );
                                    appsSkipped += 1;
                                    // eslint-disable-next-line no-continue
                                    continue;
                                }
                            }
                            // Non-TTY: proceed without prompting (upload is deliberate).

                            codeToUpload = attachDependenciesToCode(
                                code,
                                customDeps,
                                {
                                    packageJson: rawDeps.packageJson,
                                    lockfile: rawDeps.lockfile,
                                },
                            );
                        }
                        // Empty custom set: upload payload identical to today's format.
                    }

                    const body = buildImportBody(codeToUpload, projectId, {
                        createNew: options.createNew === true,
                    });

                    // eslint-disable-next-line no-await-in-loop
                    const { appUuid, version, action } = await lightdashApi<
                        ApiImportAppCodeResponse['results']
                    >({
                        method: 'POST',
                        url: `/api/v1/ee/projects/${projectId}/apps/upload`,
                        body: JSON.stringify(body),
                    });

                    if (action === 'create') {
                        appsCreated += 1;
                    } else {
                        appsUpdated += 1;
                    }

                    const actionLabel =
                        action === 'create' ? 'created' : 'updated';
                    GlobalState.log(
                        styles.success(
                            `Uploaded "${code.manifest.name}" — ${actionLabel} v${version} (${appUuid}). Building in the background; the app will show "building" until the server finishes.`,
                        ),
                    );

                    if (action === 'create') {
                        GlobalState.log(
                            `New app: ${config.context.serverUrl}/projects/${projectId}/apps/${appUuid}`,
                        );
                        if (process.stdin.isTTY && process.stdout.isTTY) {
                            // eslint-disable-next-line no-await-in-loop
                            const { retarget } = await inquirer.prompt<{
                                retarget: boolean;
                            }>([
                                {
                                    type: 'confirm',
                                    name: 'retarget',
                                    message: `Update ${subDir.name}/lightdash-app.yml to target the new app? This sets appUuid ${appUuid}, projectUuid ${projectId}, version ${version} — future uploads will update this app.`,
                                    default: true,
                                },
                            ]);
                            if (retarget) {
                                // eslint-disable-next-line no-await-in-loop
                                await retargetManifest(folderPath, {
                                    appUuid,
                                    projectUuid: projectId,
                                    version,
                                });
                                GlobalState.log(
                                    styles.success(
                                        `Updated ${subDir.name}/lightdash-app.yml → appUuid ${appUuid}, projectUuid ${projectId}, version ${version}.`,
                                    ),
                                );
                            } else {
                                GlobalState.log(
                                    styles.warning(
                                        manifestRetargetHint({
                                            folder: subDir.name,
                                            appUuid,
                                            projectUuid: projectId,
                                        }),
                                    ),
                                );
                            }
                        } else {
                            GlobalState.log(
                                styles.warning(
                                    manifestRetargetHint({
                                        folder: subDir.name,
                                        appUuid,
                                        projectUuid: projectId,
                                    }),
                                ),
                            );
                        }
                    }
                } catch (appErr) {
                    appsFailed += 1;
                    const status =
                        appErr instanceof LightdashError
                            ? appErr.statusCode
                            : undefined;
                    const hint =
                        status === 404
                            ? ' — the enterprise "data apps" feature may not be enabled on this instance'
                            : '';
                    GlobalState.log(
                        styles.error(
                            `Failed to upload app folder "${subDir.name}"${
                                status ? ` [HTTP ${status}]` : ''
                            }: ${getErrorMessage(appErr)}${hint}`,
                        ),
                    );
                }
            }

            if (appsCreated > 0) changes['data apps created'] = appsCreated;
            if (appsUpdated > 0) changes['data apps updated'] = appsUpdated;
            if (appsFailed > 0) changes['data apps failed'] = appsFailed;
            if (appsSkipped > 0) changes['data apps skipped'] = appsSkipped;
            const appSummary = summarizeUploadChanges(
                changesBeforeApps,
                changes,
            );
            output.completeItem(appSummary.detail, appSummary.variant);
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

        completeUpload();
    } catch (error) {
        output.fail(getErrorMessage(error), (Date.now() - start) / 1000, true);
        await LightdashAnalytics.track({
            event: 'upload.error',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                error: getErrorMessage(error),
            },
        });
        if (isSpaceAsCodeUploadError(error)) throw error;
        if (error instanceof AiAgentAsCodeUploadError)
            throw error.originalError;
    }
};

export const testHelpers = {
    assertUniqueSpacePaths,
    downloadSpaces,
    getFlatSpaceFileNames,
    getDashboardChartSlugs,
    readAiAgentFiles,
    readSpaceFiles,
    readSpaceNames,
    sanitizeChartForDownload,
    shouldFallBackToEmbeddedSpaces,
    shouldDownloadAiAgents,
    sortSpaceFilesParentFirst,
    summarizeUploadChanges,
    upsertSpaces,
    upsertVirtualViews,
    validateSpaceIdentity,
    writeSpaceFiles,
};
