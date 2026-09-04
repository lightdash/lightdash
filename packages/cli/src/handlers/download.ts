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
    ApiExternalConnectionAsCodeListResponse,
    ApiExternalConnectionAsCodeUpsertResponse,
    ApiGoogleSheetsSyncAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeUpsertResponse,
    ApiImportAppCodeResponse,
    ApiScheduledDeliveryAsCodeListResponse,
    ApiScheduledDeliveryAsCodeUpsertResponse,
    ApiSpaceSummaryListResponse,
    ApiSqlChartAsCodeListResponse,
    ApiVirtualViewAsCodeListResponse,
    ApiVirtualViewAsCodeUpsertResponse,
    assertUnreachable,
    AuthorizationError,
    ChartAsCode,
    ChartType,
    computeCustomDependencies,
    ContentAsCodeType as ContentAsCodeTypeEnum,
    DashboardAsCode,
    DashboardTileTypes,
    DATA_APP_VIZ_TEMPLATE,
    ExternalConnectionAsCode,
    generateSlug,
    getErrorMessage,
    GoogleSheetsSyncAsCode,
    LightdashError,
    normalizeContentAsCodePath,
    ParameterError,
    Project,
    PromotionAction,
    PromotionChanges,
    removePivotedSeriesValuesFromChartConfig,
    ScheduledDeliveryAsCode,
    SqlChartAsCode,
    validateDataAppDependencies,
    VirtualViewAsCode,
    type ContentAsCodeSettingsStamp,
    type ContentAsCodeUploadAdvisory,
    type DashboardAsCodeUpsertResult,
    type DataAppCodeDownload,
    type LightdashProjectConfig,
    type SpaceAsCode,
} from '@lightdash/common';
import { Dirent, promises as fs, type Stats } from 'fs';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import groupBy from 'lodash/groupBy';
import pLimit from 'p-limit';
import * as path from 'path';
import { validate as isUuid } from 'uuid';
import {
    LightdashAnalytics,
    type ProjectContentAsCodeCounts,
} from '../analytics/analytics';
import { getConfig, setAnswer } from '../config';
import { CLI_VERSION } from '../env';
import GlobalState from '../globalState';
import { readAndLoadLightdashProjectConfig } from '../lightdash-config';
import * as styles from '../styles';
import {
    createContentAsCodeOutput,
    logContentAsCodeDiscovery,
    type ContentAsCodeOutput,
    type ContentAsCodeOutputVariant,
} from '../terminal/contentAsCodeOutput';
import {
    applySdkMirrorToTemplateDeps,
    attachDependenciesToCode,
    buildDepsWarningLines,
    buildImportBody,
    readBundleFromDir,
    readDependenciesFromDir,
} from './apps/appCodeFiles';
import {
    appsDownloadSummary,
    capListedApps,
    computeLinkedAppSlugs,
    downloadAppsToDir,
    getDataAppReference,
    getDataAppUploadFilter,
    matchedUploadRefs,
    preSlugServerHint,
    preSlugUploadHint,
    resolveAppsLimit,
    resolveAppSpaceUuid,
    resolveUploadFilterUuids,
    selectAppsToDownload,
    shouldFallBackToSpaceScopedListing,
    unmatchedUploadRefsWarning,
    uploadFilterMatches,
} from './apps/appsDownload';
import { loadTemplateDependencies } from './apps/scaffolding';
import {
    createBuildLimitWaitState,
    withBuildLimitRetry,
} from './apps/uploadRetry';
import {
    classifyContentFilePath,
    isSqlChartContent,
} from './contentAsCode/fileDiscovery';
import {
    AI_AGENT_CODE_RESOURCE,
    ALERT_CODE_RESOURCE,
    EXTERNAL_CONNECTION_CODE_RESOURCE,
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
    isSpaceAsCodeFetchError,
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
    externalConnections: string[]; // external connection slugs (enterprise)
    apps?: string[]; // specific app UUIDs or URLs (enterprise); absent = no explicit selection
    chartTypes?: string[]; // specific custom chart type UUIDs or URLs (enterprise); absent = no explicit selection
    includeAgents?: boolean;
    includeApps?: boolean; // download: all of the project's apps, capped at --apps-limit; upload: all app folders on disk
    includeChartTypes?: boolean; // download: all custom chart types, capped at --chart-types-limit; upload: all chart-type folders on disk
    appsLimit?: string; // download only: cap for the --include-apps listing (default 50); raw string from commander
    chartTypesLimit?: string; // download only: cap for the --include-chart-types listing (default 50); raw string from commander
    createNew?: boolean; // upload only: always create a new app instead of updating the manifest's app
    allowCustomDependencies?: boolean; // upload only: approve custom-dependency uploads without prompting
    appSpace?: string; // upload only: space (slug or uuid) for data apps this run creates
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
    skipExternalConnections: boolean;
    includeAlerts: boolean;
    includeGoogleSheets: boolean;
    includeScheduledDeliveries: boolean;
    includeVirtualViews: boolean;
    includeExternalConnections: boolean;
    includeAll: boolean;
    appsOnly?: boolean; // download: implies skipCharts + skipDashboards + skipSpaces; upload: apps-only filtered run
    chartTypesOnly?: boolean; // download: implies skipCharts + skipDashboards + skipSpaces; upload: chart-types-only filtered run
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

const hasContentFilters = ({
    spacesOnly,
    charts,
    dashboards,
    agents,
    alerts,
    googleSheets,
    scheduledDeliveries,
    virtualViews,
    externalConnections,
    apps,
    chartTypes,
}: Pick<
    DownloadHandlerOptions,
    | 'spacesOnly'
    | 'charts'
    | 'dashboards'
    | 'agents'
    | 'alerts'
    | 'googleSheets'
    | 'scheduledDeliveries'
    | 'virtualViews'
    | 'externalConnections'
    | 'apps'
    | 'chartTypes'
>): boolean =>
    !spacesOnly &&
    [
        charts,
        dashboards,
        agents,
        alerts,
        googleSheets,
        scheduledDeliveries,
        virtualViews,
        externalConnections,
        apps ?? [],
        chartTypes ?? [],
    ].some((filters) => filters.length > 0);

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
    // Only cartesian configs carry pivoted series; the helper takes the
    // runtime config union, so narrow before calling.
    stripPivotSeries && chart.chartConfig.type === ChartType.CARTESIAN
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

const isLightdashContentFile = (
    folder: 'charts' | 'dashboards',
    entry: Dirent,
) => {
    if (!entry.isFile() || !entry.parentPath) return false;

    const classification = classifyContentFilePath(
        path.join(entry.parentPath, entry.name),
    );
    return (
        classification?.kind === 'content' &&
        classification.supportedExtension &&
        `${classification.contentType}s` === folder
    );
};

const isLooseContentFile = (entry: Dirent) => {
    if (!entry.isFile() || !entry.parentPath) return false;

    const classification = classifyContentFilePath(
        path.join(entry.parentPath, entry.name),
    );
    return (
        classification?.kind === 'loose' && classification.supportedExtension
    );
};

// The file's path relative to the project dir, posix; undefined outside it
const sourceFilePath = (filePath: string): string | undefined => {
    const relative = path.relative(process.cwd(), filePath);
    if (
        path.isAbsolute(relative) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`)
    ) {
        return undefined;
    }
    return relative.split(path.sep).join('/');
};

const processYamlItem = <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>(
    item: T,
    fileName: string,
    stats: Stats,
    folder: 'charts' | 'dashboards',
    metadata: LightdashMetadata,
    filePath: string,
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
        // Sent with the upsert so write-back returns to this file
        filePath: sourceFilePath(filePath),
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
    return processYamlItem(item, file.name, stats, folder, metadata, filePath);
};

const readCodeFiles = async <
    T extends ChartAsCode | DashboardAsCode | SqlChartAsCode,
>(
    folder: 'charts' | 'dashboards',
    customPath?: string,
): Promise<(T & { needsUpdating: boolean })[]> => {
    const baseDir = getDownloadFolder(customPath);

    logContentAsCodeDiscovery(`Reading ${folder} from ${baseDir}`);

    const [major] = process.versions.node.split('.').map(Number);
    if (major < 24) {
        throw new Error(
            `Node.js v24.0.0 or later is required for this command (current: ${process.version}).`,
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
                                filePath,
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
                                filePath,
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

const extractAppSlugsFromDashboards = (
    dashboards: DashboardAsCode[],
): string[] => [
    ...new Set(
        dashboards.flatMap((dashboard) =>
            dashboard.tiles.reduce<string[]>((acc, tile) => {
                if (tile.type !== DashboardTileTypes.DATA_APP) return acc;
                return tile.properties.appSlug
                    ? [...acc, tile.properties.appSlug]
                    : acc;
            }, []),
        ),
    ),
];

/**
 * Custom chart type refs bound by DATA_APP_VIZ charts — the portable slug,
 * or the legacy uuid for files written before slug bindings.
 */
const extractChartTypeRefsFromCharts = (charts: ChartAsCode[]): string[] => [
    ...new Set(
        charts.reduce<string[]>((acc, chart) => {
            if (chart.chartConfig.type !== ChartType.DATA_APP_VIZ) return acc;
            const ref =
                chart.chartConfig.config?.dataAppVizSlug ??
                chart.chartConfig.config?.dataAppVizUuid;
            return ref ? [...acc, ref] : acc;
        }, []),
    ),
];

// A virtual view's slug is the explore name charts store in tableName, so
// these names double as virtual view slug candidates.
const extractChartTableNames = (charts: ChartAsCode[]): string[] => [
    ...new Set(
        charts
            .map((chart) => chart.tableName)
            .filter((tableName): tableName is string => !!tableName),
    ),
];

export type DownloadContentResult = {
    total: number;
    chartSlugs: string[];
    chartTableNames: string[];
    appSlugs: string[];
    // Custom chart types the downloaded charts render with (slug or legacy
    // uuid refs), for the Linked custom chart types step.
    chartTypeRefs: string[];
    metadataEntries: MetadataEntry[];
    spaces: SpaceAsCode[];
};

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
): Promise<DownloadContentResult> => {
    const contentFilters = parseContentFilters(ids);
    const folderScheme: FolderScheme = nested ? 'nested' : 'flat';
    const config = getContentTypeConfig(type, projectId);

    let offset = 0;
    let total = 0;
    let chartSlugs: string[] = [];
    let chartTableNames: string[] = [];
    let appSlugs: string[] = [];
    let chartTypeRefs: string[] = [];
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
            appSlugs = [
                ...appSlugs,
                ...extractAppSlugsFromDashboards(results.dashboards),
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
            chartTableNames = [
                ...chartTableNames,
                ...extractChartTableNames(results.charts),
            ];
            chartTypeRefs = [
                ...chartTypeRefs,
                ...extractChartTypeRefsFromCharts(results.charts),
            ];
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

    return {
        total,
        chartSlugs: [...new Set(chartSlugs)],
        chartTableNames: [...new Set(chartTableNames)],
        appSlugs: [...new Set(appSlugs)],
        chartTypeRefs: [...new Set(chartTypeRefs)],
        metadataEntries: allMetadataEntries,
        spaces: allSpaces,
    };
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
        pruneOtherDocuments: slugs.length === 0,
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

// This download is implicit (derived from a dashboard's charts, not asked for
// by the user), so an older server without the endpoint (404) or a user
// without content-as-code access (403) must not fail the run.
const isVirtualViewsUnavailableError = (error: unknown): boolean =>
    error instanceof LightdashError && [403, 404].includes(error.statusCode);

/**
 * Downloads the virtual views backing a dashboard's charts. The candidates are
 * chart table names, so ones the server reports as missing are just regular
 * dbt explores — expected, never warned. Returns null when virtual views are
 * unavailable on the server.
 */
const downloadLinkedVirtualViews = async (
    projectId: string,
    tableNames: string[],
    customPath?: string,
): Promise<number | null> => {
    const query = new URLSearchParams(
        tableNames.map((name) => ['slugs', name] as [string, string]),
    ).toString();
    let results: ApiVirtualViewAsCodeListResponse['results'];
    try {
        results = await lightdashApi<
            ApiVirtualViewAsCodeListResponse['results']
        >({
            method: 'GET',
            url: `/api/v1/projects/${projectId}/code/virtualViews?${query}`,
            body: undefined,
        });
    } catch (error) {
        if (isVirtualViewsUnavailableError(error)) {
            GlobalState.debug(
                `Could not download linked virtual views: ${getErrorMessage(error)}`,
            );
            return null;
        }
        throw error;
    }
    if (results.virtualViews.length > 0) {
        await writeCodeResourceDocuments({
            definition: VIRTUAL_VIEW_CODE_RESOURCE,
            basePath: getDownloadFolder(customPath),
            documents: results.virtualViews,
            pruneOtherDocuments: false,
        });
    }
    results.skipped.forEach(({ slug, reason }) =>
        GlobalState.log(
            styles.warning(`Skipped virtual view "${slug}": ${reason}`),
        ),
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
    candidateSlugs: string[] = [],
): Promise<Record<string, number>> => {
    const virtualViews = await readVirtualViewFiles(customPath);
    // Candidates are chart table names, and most are regular dbt explores
    // with no local file — unmatched candidates never warn; explicit slugs do.
    const candidateSet = new Set(candidateSlugs);
    const selected =
        slugs.length > 0 || candidateSet.size > 0
            ? virtualViews.filter(
                  ({ slug }) => slugs.includes(slug) || candidateSet.has(slug),
              )
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

export const getExternalConnectionSecretEnvVar = (slug: string): string =>
    `LIGHTDASH_EXTERNAL_CONNECTION_SECRET_${slug
        .replace(/-/g, '_')
        .toUpperCase()}`;

const EXTERNAL_CONNECTION_SECRET_TYPES = new Set([
    'api_key',
    'bearer_token',
    'google_service_account',
    'oauth_client_credentials',
]);

/**
 * External connections are enterprise-only and admin-gated; when the download
 * was reached implicitly through --include-all these statuses mean "not
 * available here" rather than a real failure: 403 = missing
 * manage:ExternalConnection, 404 = pre-feature server, 422 = OSS server with
 * no EE coder service provider (MissingConfigError).
 */
const isExternalConnectionsUnavailableError = (error: unknown): boolean =>
    error instanceof LightdashError &&
    [403, 404, 422].includes(error.statusCode);

const isAiAgentsUnavailableError = (error: unknown): boolean =>
    error instanceof LightdashError &&
    [403, 404, 422].includes(error.statusCode);

const downloadExternalConnections = async (
    projectId: string,
    slugs: string[],
    implicit: boolean,
    customPath?: string,
): Promise<number> => {
    const slugQuery = slugs.map((slug) => ['slugs', slug] as [string, string]);
    let offset = 0;
    let total = 0;
    const connections: ExternalConnectionAsCode[] = [];
    // Every page repeats the same full list, so warn once after the loop.
    let missingSlugs: string[] = [];

    try {
        do {
            const query = new URLSearchParams([
                ...slugQuery,
                ['offset', String(offset)],
            ]).toString();
            const results = await lightdashApi<
                ApiExternalConnectionAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/code/externalConnections?${query}`,
                body: undefined,
            });

            connections.push(...results.externalConnections);
            missingSlugs = results.missingSlugs;
            offset = results.offset;
            total = results.total;
        } while (offset < total);
    } catch (error) {
        if (implicit && isExternalConnectionsUnavailableError(error)) {
            GlobalState.log(
                styles.warning(
                    'Skipping external connections: they require Lightdash Enterprise and the manage:ExternalConnection permission.',
                ),
            );
            GlobalState.debug(
                `Could not download external connections: ${getErrorMessage(error)}`,
            );
            return 0;
        }
        throw error;
    }

    missingSlugs.forEach((slug) =>
        GlobalState.log(
            styles.warning(`External connection "${slug}" was not found`),
        ),
    );

    await writeCodeResourceDocuments({
        definition: EXTERNAL_CONNECTION_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
        documents: connections,
        pruneOtherDocuments: slugs.length === 0,
    });

    const secretEnvVars = connections
        .filter(({ authType }) =>
            EXTERNAL_CONNECTION_SECRET_TYPES.has(authType),
        )
        .map(({ slug }) => getExternalConnectionSecretEnvVar(slug));
    if (secretEnvVars.length > 0) {
        GlobalState.log(
            styles.warning(
                `Secrets are never downloaded. To create these connections on another instance, set:\n\t${secretEnvVars.join('\n\t')}`,
            ),
        );
    }

    return connections.length;
};

const readExternalConnectionFiles = async (
    customPath?: string,
): Promise<ExternalConnectionAsCode[]> => {
    const result = await readCodeResourceFiles({
        definition: EXTERNAL_CONNECTION_CODE_RESOURCE,
        basePath: getDownloadFolder(customPath),
    });
    assertCodeResourceFilesValid(result);
    return result.files.map(({ document }) => document);
};

const upsertExternalConnections = async (
    projectId: string,
    slugs: string[],
    changes: Record<string, number>,
    force: boolean,
    canUpload: boolean,
    customPath?: string,
): Promise<Record<string, number>> => {
    const connections = await readExternalConnectionFiles(customPath);
    const selected = slugs.length
        ? connections.filter(({ slug }) => slugs.includes(slug))
        : connections;
    const selectedSlugs = new Set(selected.map(({ slug }) => slug));
    slugs
        .filter((slug) => !selectedSlugs.has(slug))
        .forEach((slug) =>
            GlobalState.log(
                styles.warning(
                    `External connection "${slug}" was not found locally`,
                ),
            ),
        );
    if (selected.length > 0 && !canUpload) {
        GlobalState.log(
            styles.error(
                `Error uploading external connections: the manage:ExternalConnection permission is required (enterprise feature)`,
            ),
        );
        return changes;
    }
    for (const connection of selected.sort((left, right) =>
        left.slug.localeCompare(right.slug),
    )) {
        const envVar = getExternalConnectionSecretEnvVar(connection.slug);
        const envValue = process.env[envVar];
        const secret =
            envValue !== undefined && envValue !== '' ? envValue : undefined;
        if (envValue === '') {
            GlobalState.log(
                styles.warning(
                    `Environment variable ${envVar} is set but empty; treating the secret as not provided.`,
                ),
            );
        }
        // The parser keeps unknown keys, so a secret authored into the YAML
        // would otherwise be sent verbatim — strip it and tell the user.
        if ('secret' in connection) {
            delete (connection as Record<string, unknown>).secret;
            GlobalState.log(
                styles.warning(
                    `Ignoring "secret" in the file for "${connection.slug}" — secrets must never be stored in YAML. Set ${envVar} instead.`,
                ),
            );
        }
        try {
            const result = await lightdashApi<
                ApiExternalConnectionAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/externalConnections/${encodeURIComponent(
                    connection.slug,
                )}?force=${force}`,
                body: JSON.stringify({
                    connection,
                    ...(secret !== undefined ? { secret } : {}),
                }),
            });
            const action = `external connections ${getPromoteAction(result.action)}`;
            changes[action] = (changes[action] ?? 0) + 1;
        } catch (error) {
            const errorKey = 'external connections with errors';
            changes[errorKey] = (changes[errorKey] ?? 0) + 1;
            const secretHint =
                secret === undefined &&
                EXTERNAL_CONNECTION_SECRET_TYPES.has(connection.authType)
                    ? `\n\tSet ${envVar} to provide the secret for "${connection.slug}" — secrets are read from the environment at upload time and never stored in YAML.`
                    : '';
            GlobalState.log(
                styles.error(
                    `Error upserting external connection:\n\t"${connection.name}" (slug: "${connection.slug}")\n\t${getErrorMessage(error)}${secretHint}`,
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
    implicit: boolean,
    customPath?: string,
): Promise<number> => {
    const idQuery = ids.map((id) => ['ids', id] as [string, string]);
    let offset = 0;
    let total = 0;
    let downloaded = 0;
    const agents: AgentAsCode[] = [];

    try {
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
            pruneOtherDocuments: ids.length === 0,
        });
    } catch (error) {
        if (implicit && isAiAgentsUnavailableError(error)) {
            GlobalState.log(
                styles.warning(
                    'Skipping AI agents: they require Lightdash Enterprise and AI agent access.',
                ),
            );
            GlobalState.debug(
                `Could not download AI agents: ${getErrorMessage(error)}`,
            );
            return 0;
        }
        throw error;
    }

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
    implicit: boolean = false,
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

    let results: ApiAgentAsCodeUpsertResponse['results'];
    try {
        results = await lightdashApi<ApiAgentAsCodeUpsertResponse['results']>({
            method: 'POST',
            url: `/api/v1/projects/${projectId}/code/aiAgents?force=${force}`,
            body: JSON.stringify({ agents: filteredAgents }),
        });
    } catch (error) {
        if (implicit && isAiAgentsUnavailableError(error)) {
            GlobalState.log(
                styles.warning(
                    'Skipping AI agents: they require Lightdash Enterprise and AI agent access.',
                ),
            );
            GlobalState.debug(
                `Could not upload AI agents: ${getErrorMessage(error)}`,
            );
            return changes;
        }
        throw error;
    }

    (results.warnings ?? []).forEach((warning) =>
        GlobalState.log(styles.warning(`  ⚠ ${warning}`)),
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

type ListedApp = { appUuid: string; slug: string };

// Space-scoped fallback listing for servers without the project-wide apps
// endpoint; omits apps that were never added to a space.
const listAppsViaContentApi = async (
    projectId: string,
): Promise<ListedApp[]> => {
    const listedApps: ListedApp[] = [];
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
        listedApps.push(
            ...contentResult.data
                .filter((item) => item.contentType === 'data_app')
                .map((item) => ({ appUuid: item.uuid, slug: item.slug })),
        );
        totalPageCount = contentResult.pagination?.totalPageCount ?? 1;
        page += 1;
    } while (page <= totalPageCount);
    return listedApps;
};

export const downloadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);

    const isOrganizationDownload = options.organization === true;

    if (options.appsOnly && options.chartTypesOnly) {
        throw new ParameterError(
            '--apps-only cannot be combined with --chart-types-only.',
        );
    }

    // Bare --apps-only means "all apps": imply --include-apps.
    if (
        options.appsOnly &&
        options.apps === undefined &&
        options.includeApps !== true &&
        options.includeAll !== true
    ) {
        options.includeApps = true;
    }
    // Bare --chart-types-only means "all chart types" likewise.
    if (
        options.chartTypesOnly &&
        options.chartTypes === undefined &&
        options.includeChartTypes !== true &&
        options.includeAll !== true
    ) {
        options.includeChartTypes = true;
    }

    const includeAll = options.includeAll === true;
    const includeApps =
        !options.spacesOnly &&
        !options.chartTypesOnly &&
        (options.includeApps === true || includeAll);
    const includeChartTypes =
        !options.spacesOnly &&
        !options.appsOnly &&
        (options.includeChartTypes === true || includeAll);
    const includeAllOptionalContent =
        includeAll &&
        !options.appsOnly &&
        !options.chartTypesOnly &&
        !options.spacesOnly;
    const { limit: appsLimit, noEffectWarning: appsLimitWarning } =
        resolveAppsLimit(options.appsLimit, includeApps);
    if (appsLimitWarning) {
        GlobalState.log(styles.warning(appsLimitWarning));
    }
    const { limit: chartTypesLimit, noEffectWarning: chartTypesLimitWarning } =
        resolveAppsLimit(options.chartTypesLimit, includeChartTypes, {
            limitFlag: '--chart-types-limit',
            includeFlag: '--include-chart-types',
            refsFlag: '--chart-types',
        });
    if (chartTypesLimitWarning) {
        GlobalState.log(styles.warning(chartTypesLimitWarning));
    }

    if (options.appsOnly) {
        const appsOnlySelection = selectAppsToDownload({
            apps: Array.isArray(options.apps) ? options.apps : undefined,
            includeApps,
        });
        if (appsOnlySelection.mode === 'none') {
            throw new ParameterError(
                'Nothing to download: --apps-only requires --apps <appReferences...>, --include-apps, or --include-all.',
            );
        }
        options.chartTypes = undefined;
        options.skipCharts = true;
        options.skipDashboards = true;
        options.skipSpaces = true;
        options.includeAgents = false;
        options.includeAlerts = false;
        options.includeGoogleSheets = false;
        options.includeScheduledDeliveries = false;
        options.includeVirtualViews = false;
        options.includeExternalConnections = false;
    }

    if (options.chartTypesOnly) {
        const chartTypesOnlySelection = selectAppsToDownload({
            apps: Array.isArray(options.chartTypes)
                ? options.chartTypes
                : undefined,
            includeApps: includeChartTypes,
        });
        if (chartTypesOnlySelection.mode === 'none') {
            throw new ParameterError(
                'Nothing to download: --chart-types-only requires --chart-types <chartTypeReferences...>, --include-chart-types, or --include-all.',
            );
        }
        options.apps = undefined;
        options.skipCharts = true;
        options.skipDashboards = true;
        options.skipSpaces = true;
        options.includeAgents = false;
        options.includeAlerts = false;
        options.includeGoogleSheets = false;
        options.includeScheduledDeliveries = false;
        options.includeVirtualViews = false;
        options.includeExternalConnections = false;
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
        options.chartTypes = [];
        options.googleSheets = [];
        options.scheduledDeliveries = [];
        options.virtualViews = [];
        options.externalConnections = [];
        options.includeAgents = false;
        options.includeApps = false;
        options.includeAlerts = false;
        options.includeGoogleSheets = false;
        options.includeScheduledDeliveries = false;
        options.includeVirtualViews = false;
        options.includeExternalConnections = false;
    }

    if (options.rootSpaces && options.nested) {
        throw new ParameterError(
            '--root-spaces cannot be combined with --nested',
        );
    }

    const hasFilters = hasContentFilters(options);
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

    const counts: ProjectContentAsCodeCounts = {};
    // Per-resource app/chart-type failures are reported inline and tallied
    // here so the process can exit non-zero without aborting the download.
    let downloadFailures = 0;
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
        // Shared across both apps-download steps so two different apps whose
        // names collide under the pre-slug fallback naming don't clobber each other.
        const downloadedAppFolders = new Set<string>();
        // Chart types live in their own folder, so they track their own names.
        const downloadedChartTypeFolders = new Set<string>();
        // App slugs referenced by downloaded dashboards' tiles, populated by
        // the Dashboards step and consumed by the Linked data apps step.
        let dashboardAppSlugs: string[] = [];
        const explicitAppRefs = new Set(
            (Array.isArray(options.apps) ? options.apps : []).map(
                getDataAppReference,
            ),
        );
        // Chart-type refs bound by downloaded charts, populated by the
        // Charts and Linked charts steps and consumed by the Linked custom
        // chart types step.
        let downloadedChartVizRefs: string[] = [];
        const explicitChartTypeRefs = new Set(
            (Array.isArray(options.chartTypes) ? options.chartTypes : []).map(
                getDataAppReference,
            ),
        );

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
                counts.spacesNum = spaceTotal;
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
                action: async () => {
                    const total = await downloadVirtualViews(
                        projectId,
                        options.virtualViews,
                        options.path,
                    );
                    counts.virtualViewsNum = total;
                    return total;
                },
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
                const {
                    total: regularChartTotal,
                    metadataEntries: regularChartMeta,
                    chartTypeRefs: mainChartTypeRefs,
                } = await output.runItem({
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
                    detail: ({ total }) => `${total} downloaded`,
                });
                allMetadataEntries = [
                    ...allMetadataEntries,
                    ...regularChartMeta,
                ];
                downloadedChartVizRefs = [
                    ...downloadedChartVizRefs,
                    ...mainChartTypeRefs,
                ];

                const { total: sqlChartTotal, metadataEntries: sqlChartMeta } =
                    await output.runItem({
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
                        detail: ({ total }) => `${total} downloaded`,
                    });
                allMetadataEntries = [...allMetadataEntries, ...sqlChartMeta];

                counts.chartsNum = regularChartTotal + sqlChartTotal;
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
                let appSlugs: string[] = [];

                let dashMeta: MetadataEntry[];
                ({
                    total: counts.dashboardsNum,
                    chartSlugs,
                    appSlugs,
                    metadataEntries: dashMeta,
                } = await output.runItem({
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
                    detail: ({ total }) => `${total} downloaded`,
                }));
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
                    const {
                        total: regularCharts,
                        chartTableNames: linkedChartTableNames,
                        metadataEntries: linkedChartMeta,
                        chartTypeRefs: linkedChartVizRefs,
                    } = await downloadContent(
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
                    downloadedChartVizRefs = [
                        ...downloadedChartVizRefs,
                        ...linkedChartVizRefs,
                    ];

                    const { total: sqlCharts, metadataEntries: linkedSqlMeta } =
                        await downloadContent(
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

                    // Virtual views the linked charts are built on. Skipped
                    // when a broader step already downloaded every one.
                    if (
                        linkedChartTableNames.length > 0 &&
                        !includeAllOptionalContent &&
                        !options.includeVirtualViews
                    ) {
                        output.startItem('Linked virtual views');
                        const linkedVirtualViews =
                            await downloadLinkedVirtualViews(
                                projectId,
                                linkedChartTableNames,
                                options.path,
                            );
                        if (linkedVirtualViews === null) {
                            output.completeItem(
                                'not available on this server',
                                'warning',
                            );
                        } else {
                            counts.virtualViewsNum =
                                (counts.virtualViewsNum ?? 0) +
                                linkedVirtualViews;
                            output.completeItem(
                                `${linkedVirtualViews} downloaded`,
                            );
                        }
                    }
                }

                // Consumed after the explicit apps step (see cappedAppSlugs).
                dashboardAppSlugs = appSlugs;
            }
        }

        if (!options.spacesOnly && shouldDownloadAiAgents(options)) {
            const implicit =
                includeAllOptionalContent &&
                options.includeAgents !== true &&
                options.agents.length === 0;
            await output.runItem({
                label: 'AI agents',
                action: async () => {
                    const total = await downloadAiAgents(
                        projectId,
                        options.agents,
                        implicit,
                        options.path,
                    );
                    counts.agentsNum = total;
                    return total;
                },
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
                action: async () => {
                    const total = await downloadScheduledContent(
                        projectId,
                        options.alerts,
                        ContentAsCodeTypeEnum.ALERT,
                        options.path,
                    );
                    counts.alertsNum = total;
                    return total;
                },
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
                action: async () => {
                    const total = await downloadScheduledContent(
                        projectId,
                        options.scheduledDeliveries,
                        ContentAsCodeTypeEnum.SCHEDULED_DELIVERY,
                        options.path,
                    );
                    counts.scheduledDeliveriesNum = total;
                    return total;
                },
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
                action: async () => {
                    const total = await downloadScheduledContent(
                        projectId,
                        options.googleSheets,
                        ContentAsCodeTypeEnum.GOOGLE_SHEETS_SYNC,
                        options.path,
                    );
                    counts.googleSheetsNum = total;
                    return total;
                },
                detail: (total) => `${total} downloaded`,
            });
        }

        if (
            includeAllOptionalContent ||
            options.includeExternalConnections ||
            options.externalConnections.length > 0
        ) {
            // Only --include-all is implicit: unavailable (non-EE / no
            // permission) then warns and skips instead of failing the download
            const implicit =
                includeAllOptionalContent &&
                !options.includeExternalConnections &&
                options.externalConnections.length === 0;
            await output.runItem({
                label: 'External connections',
                action: async () => {
                    const total = await downloadExternalConnections(
                        projectId,
                        options.externalConnections,
                        implicit,
                        options.path,
                    );
                    counts.externalConnectionsNum = total;
                    return total;
                },
                detail: (total) => `${total} downloaded`,
            });
        }

        // Download data apps (enterprise, opt-in via --apps / --include-apps / --include-all)
        const appsSelection = selectAppsToDownload({
            apps: Array.isArray(options.apps) ? options.apps : undefined,
            includeApps,
        });
        // Slugs covered by a (possibly --apps-limit-truncated) --include-apps
        // listing, so the Linked data apps step knows what fell outside the cap.
        let cappedAppSlugs = new Set<string>();

        if (appsSelection.mode !== 'none') {
            output.startItem('Data apps');
            let appRefsToDownload: string[];
            let appListingError: string | null = null;

            if (appsSelection.mode === 'explicit') {
                appRefsToDownload = appsSelection.appRefs;
            } else {
                // List every app in the project (includes apps not in any space)
                output.updateActive('listing project apps…');
                let listedApps: ListedApp[];
                try {
                    const projectApps = await lightdashApi<
                        ApiEmbedProjectAppsResponse['results']
                    >({
                        method: 'GET',
                        url: `/api/v1/ee/projects/${projectId}/apps`,
                        body: undefined,
                    });
                    listedApps = projectApps.map((app) => ({
                        appUuid: app.appUuid,
                        slug: app.slug,
                    }));
                } catch (listErr) {
                    if (!shouldFallBackToSpaceScopedListing(listErr)) {
                        if (!includeAllOptionalContent) {
                            throw listErr;
                        }
                        appListingError = getErrorMessage(listErr);
                        listedApps = [];
                    } else {
                        GlobalState.log(
                            styles.warning(
                                'This server does not support project-wide app listing; only apps that are in a space will be included.',
                            ),
                        );
                        listedApps = await listAppsViaContentApi(projectId);
                    }
                }

                const { appUuids: cappedAppUuids, truncatedCount } =
                    capListedApps(
                        listedApps.map((app) => app.appUuid),
                        appsLimit,
                    );
                if (truncatedCount > 0) {
                    GlobalState.log(
                        styles.warning(
                            `Found ${listedApps.length} data apps, downloading the first ${appsLimit}. Pass --apps-limit <n> to raise the cap.`,
                        ),
                    );
                }
                const cappedAppUuidSet = new Set(cappedAppUuids);
                cappedAppSlugs = new Set(
                    listedApps
                        .filter((app) => cappedAppUuidSet.has(app.appUuid))
                        .map((app) => app.slug),
                );
                appRefsToDownload = [
                    ...new Set([
                        ...cappedAppUuids,
                        ...appsSelection.extraAppRefs,
                    ]),
                ];
            }

            if (appRefsToDownload.length === 0) {
                counts.appsNum = 0;
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
                    `0 of ${appRefsToDownload.length} downloaded`,
                );
                const baseDir = getDownloadFolder(options.path);
                const appsDir = path.join(baseDir, 'apps');

                const {
                    successCount,
                    skippedNotBuiltCount,
                    skippedWrongKindCount,
                    failures,
                } = await downloadAppsToDir({
                    appRefs: appRefsToDownload,
                    projectId,
                    appsDir,
                    takenFolders: downloadedAppFolders,
                    cliVersion: CLI_VERSION,
                    fetchApp: (fetchProjectId, appRef) =>
                        lightdashApi<DataAppCodeDownload>({
                            method: 'GET',
                            url: `/api/v1/ee/projects/${fetchProjectId}/apps/${encodeURIComponent(
                                appRef,
                            )}/download`,
                            body: undefined,
                        }),
                    skipBundle: (manifest) =>
                        manifest.template === DATA_APP_VIZ_TEMPLATE
                            ? 'this is a custom chart type — download it with --chart-types or --include-chart-types'
                            : null,
                    onProgress: (processed, total) =>
                        output.updateActive(
                            `${processed} of ${total} processed`,
                        ),
                });

                const summary = appsDownloadSummary(
                    successCount,
                    appRefsToDownload.length,
                    failures,
                    appsDir,
                    skippedNotBuiltCount + skippedWrongKindCount,
                );
                counts.appsNum = successCount;
                downloadFailures += failures.length;
                output.completeItem(
                    `${successCount} downloaded${
                        skippedNotBuiltCount + skippedWrongKindCount > 0
                            ? `, ${
                                  skippedNotBuiltCount + skippedWrongKindCount
                              } skipped`
                            : ''
                    }${
                        failures.length > 0 ? `, ${failures.length} failed` : ''
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

        // Download custom chart types (enterprise, opt-in via --chart-types /
        // --include-chart-types / --include-all) into chart-types/, kept
        // separate from data apps.
        const chartTypesSelection = selectAppsToDownload({
            apps: Array.isArray(options.chartTypes)
                ? options.chartTypes
                : undefined,
            includeApps: includeChartTypes,
        });
        // Refs (slug AND uuid) covered by a possibly-truncated
        // --include-chart-types listing, so the Linked custom chart types
        // step knows what was already downloaded.
        let cappedChartTypeRefs = new Set<string>();
        if (chartTypesSelection.mode !== 'none') {
            output.startItem('Custom chart types');
            let chartTypeRefsToDownload: string[];
            let chartTypeListingError: string | null = null;

            if (chartTypesSelection.mode === 'explicit') {
                chartTypeRefsToDownload = chartTypesSelection.appRefs;
            } else {
                output.updateActive('listing project chart types…');
                let listedChartTypes: ListedApp[] = [];
                try {
                    const projectChartTypes = await lightdashApi<
                        ApiEmbedProjectAppsResponse['results']
                    >({
                        method: 'GET',
                        url: `/api/v1/ee/projects/${projectId}/apps/chart-types`,
                        body: undefined,
                    });
                    listedChartTypes = projectChartTypes.map((chartType) => ({
                        appUuid: chartType.appUuid,
                        slug: chartType.slug,
                    }));
                } catch (listErr) {
                    if (shouldFallBackToSpaceScopedListing(listErr)) {
                        // 404: the server predates the chart-types listing
                        // (or chart types entirely) — nothing to list.
                        GlobalState.log(
                            styles.warning(
                                'This server does not support listing custom chart types; pass explicit --chart-types references or upgrade the server.',
                            ),
                        );
                        listedChartTypes = [];
                    } else if (includeAllOptionalContent) {
                        chartTypeListingError = getErrorMessage(listErr);
                        listedChartTypes = [];
                    } else {
                        throw listErr;
                    }
                }

                const {
                    appUuids: cappedChartTypeUuids,
                    truncatedCount: chartTypesTruncated,
                } = capListedApps(
                    listedChartTypes.map((chartType) => chartType.appUuid),
                    chartTypesLimit,
                );
                if (chartTypesTruncated > 0) {
                    GlobalState.log(
                        styles.warning(
                            `Found ${listedChartTypes.length} custom chart types, downloading the first ${chartTypesLimit}. Pass --chart-types-limit <n> to raise the cap.`,
                        ),
                    );
                }
                const cappedChartTypeUuidSet = new Set(cappedChartTypeUuids);
                cappedChartTypeRefs = new Set(
                    listedChartTypes
                        .filter((chartType) =>
                            cappedChartTypeUuidSet.has(chartType.appUuid),
                        )
                        .flatMap((chartType) => [
                            chartType.slug,
                            chartType.appUuid,
                        ]),
                );
                chartTypeRefsToDownload = [
                    ...new Set([
                        ...cappedChartTypeUuids,
                        ...chartTypesSelection.extraAppRefs,
                    ]),
                ];
            }

            if (chartTypeRefsToDownload.length === 0) {
                counts.chartTypesNum = 0;
                if (chartTypeListingError === null) {
                    output.completeItem('0 found');
                } else {
                    output.completeItem(
                        `listing failed: ${chartTypeListingError}`,
                        'warning',
                    );
                }
            } else {
                output.updateActive(
                    `0 of ${chartTypeRefsToDownload.length} downloaded`,
                );
                const chartTypesDir = path.join(
                    getDownloadFolder(options.path),
                    'chart-types',
                );

                const chartTypesOutcome = await downloadAppsToDir({
                    appRefs: chartTypeRefsToDownload,
                    projectId,
                    appsDir: chartTypesDir,
                    takenFolders: downloadedChartTypeFolders,
                    cliVersion: CLI_VERSION,
                    fetchApp: (fetchProjectId, appRef) =>
                        lightdashApi<DataAppCodeDownload>({
                            method: 'GET',
                            url: `/api/v1/ee/projects/${fetchProjectId}/apps/${encodeURIComponent(
                                appRef,
                            )}/download`,
                            body: undefined,
                        }),
                    skipBundle: (manifest) =>
                        manifest.template !== DATA_APP_VIZ_TEMPLATE
                            ? 'this is a data app — download it with --apps or --include-apps'
                            : null,
                    onProgress: (processed, total) =>
                        output.updateActive(
                            `${processed} of ${total} processed`,
                        ),
                });

                const chartTypesSummary = appsDownloadSummary(
                    chartTypesOutcome.successCount,
                    chartTypeRefsToDownload.length,
                    chartTypesOutcome.failures,
                    chartTypesDir,
                    chartTypesOutcome.skippedNotBuiltCount +
                        chartTypesOutcome.skippedWrongKindCount,
                    'custom chart type',
                );
                counts.chartTypesNum = chartTypesOutcome.successCount;
                downloadFailures += chartTypesOutcome.failures.length;
                const chartTypesSkipped =
                    chartTypesOutcome.skippedNotBuiltCount +
                    chartTypesOutcome.skippedWrongKindCount;
                output.completeItem(
                    `${chartTypesOutcome.successCount} downloaded${
                        chartTypesSkipped > 0
                            ? `, ${chartTypesSkipped} skipped`
                            : ''
                    }${
                        chartTypesOutcome.failures.length > 0
                            ? `, ${chartTypesOutcome.failures.length} failed`
                            : ''
                    }`,
                    chartTypesSummary.ok ? undefined : 'warning',
                );
                if (!chartTypesSummary.ok) {
                    chartTypesSummary.failureLines.forEach((line) =>
                        GlobalState.log(styles.warning(line)),
                    );
                }
            }
        }

        // Dashboard-referenced apps not already covered above (explicit
        // --apps ref, or a non-truncated slot in the --include-apps cap).
        const linkedAppSlugs = computeLinkedAppSlugs({
            appSlugs: dashboardAppSlugs,
            explicitRefs: explicitAppRefs,
            includeApps,
            cappedAppSlugs,
        });
        if (linkedAppSlugs.length > 0) {
            output.startItem('Linked data apps');
            const appsDir = path.join(getDownloadFolder(options.path), 'apps');
            const outcome = await downloadAppsToDir({
                appRefs: linkedAppSlugs,
                projectId,
                appsDir,
                takenFolders: downloadedAppFolders,
                cliVersion: CLI_VERSION,
                fetchApp: (fetchProjectId, appRef) =>
                    lightdashApi<DataAppCodeDownload>({
                        method: 'GET',
                        url: `/api/v1/ee/projects/${fetchProjectId}/apps/${encodeURIComponent(
                            appRef,
                        )}/download`,
                        body: undefined,
                    }),
                // Dashboard data-app tiles reference apps, never chart types.
                skipBundle: (manifest) =>
                    manifest.template === DATA_APP_VIZ_TEMPLATE
                        ? 'this is a custom chart type — dashboard app tiles cannot reference it'
                        : null,
                onProgress: (processed, total) =>
                    output.updateActive(`${processed} of ${total} processed`),
            });
            const linkedSkipped =
                outcome.skippedNotBuiltCount + outcome.skippedWrongKindCount;
            const linkedSummary = appsDownloadSummary(
                outcome.successCount,
                linkedAppSlugs.length,
                outcome.failures,
                appsDir,
                linkedSkipped,
            );
            counts.appsNum = (counts.appsNum ?? 0) + outcome.successCount;
            downloadFailures += outcome.failures.length;
            output.completeItem(
                `${outcome.successCount} downloaded${
                    linkedSkipped > 0 ? `, ${linkedSkipped} skipped` : ''
                }${
                    outcome.failures.length > 0
                        ? `, ${outcome.failures.length} failed`
                        : ''
                }`,
                linkedSummary.ok ? undefined : 'warning',
            );
            if (!linkedSummary.ok) {
                linkedSummary.failureLines.forEach((line) =>
                    GlobalState.log(styles.warning(line)),
                );
            }
        }

        // Custom chart types the downloaded charts render with, not already
        // covered by an explicit --chart-types ref or a (non-truncated)
        // --include-chart-types listing — a chart file without its chart
        // type cannot be uploaded elsewhere.
        const linkedChartTypeRefs = computeLinkedAppSlugs({
            appSlugs: [...new Set(downloadedChartVizRefs)],
            explicitRefs: explicitChartTypeRefs,
            includeApps: includeChartTypes,
            cappedAppSlugs: cappedChartTypeRefs,
        });
        if (linkedChartTypeRefs.length > 0) {
            output.startItem('Linked custom chart types');
            const chartTypesDir = path.join(
                getDownloadFolder(options.path),
                'chart-types',
            );
            const linkedChartTypesOutcome = await downloadAppsToDir({
                appRefs: linkedChartTypeRefs,
                projectId,
                appsDir: chartTypesDir,
                takenFolders: downloadedChartTypeFolders,
                cliVersion: CLI_VERSION,
                fetchApp: (fetchProjectId, appRef) =>
                    lightdashApi<DataAppCodeDownload>({
                        method: 'GET',
                        url: `/api/v1/ee/projects/${fetchProjectId}/apps/${encodeURIComponent(
                            appRef,
                        )}/download`,
                        body: undefined,
                    }),
                // Chart configs reference chart types, never data apps.
                skipBundle: (manifest) =>
                    manifest.template !== DATA_APP_VIZ_TEMPLATE
                        ? 'this is a data app — chart configs cannot reference it'
                        : null,
                onProgress: (processed, total) =>
                    output.updateActive(`${processed} of ${total} processed`),
            });
            const linkedChartTypesSkipped =
                linkedChartTypesOutcome.skippedNotBuiltCount +
                linkedChartTypesOutcome.skippedWrongKindCount;
            const linkedChartTypesSummary = appsDownloadSummary(
                linkedChartTypesOutcome.successCount,
                linkedChartTypeRefs.length,
                linkedChartTypesOutcome.failures,
                chartTypesDir,
                linkedChartTypesSkipped,
                'custom chart type',
            );
            counts.chartTypesNum =
                (counts.chartTypesNum ?? 0) +
                linkedChartTypesOutcome.successCount;
            downloadFailures += linkedChartTypesOutcome.failures.length;
            output.completeItem(
                `${linkedChartTypesOutcome.successCount} downloaded${
                    linkedChartTypesSkipped > 0
                        ? `, ${linkedChartTypesSkipped} skipped`
                        : ''
                }${
                    linkedChartTypesOutcome.failures.length > 0
                        ? `, ${linkedChartTypesOutcome.failures.length} failed`
                        : ''
                }`,
                linkedChartTypesSummary.ok ? undefined : 'warning',
            );
            if (!linkedChartTypesSummary.ok) {
                linkedChartTypesSummary.failureLines.forEach((line) =>
                    GlobalState.log(styles.warning(line)),
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
        if (downloadFailures > 0) {
            GlobalState.log(
                styles.error(
                    `${downloadFailures} resource(s) failed to download — see errors above.`,
                ),
            );
            process.exitCode = 1;
        }

        await LightdashAnalytics.track({
            event: 'download.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                ...counts,
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
        throw error;
    }
};

const storeUploadChanges = (
    changes: Record<string, number>,
    type: 'charts' | 'dashboards',
    promoteChanges: PromotionChanges,
): Record<string, number> => {
    // The API also echoes untouched spaces and chart tiles; only count the uploaded type
    const promotions: { action: PromotionAction }[] = promoteChanges[type];
    return promotions.reduce<Record<string, number>>(
        (acc, promoteChange) => {
            const key = `${type} ${getPromoteAction(promoteChange.action)}`;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        },
        { ...changes },
    );
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

const countChangeDelta = (
    before: Record<string, number>,
    after: Record<string, number>,
): number =>
    Object.entries(after).reduce((total, [key, value]) => {
        const difference = value - (before[key] ?? 0);
        return difference > 0 ? total + difference : total;
    }, 0);

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

const hasUploadFailures = (changes: Record<string, number>): boolean =>
    Object.entries(changes).some(
        ([key, value]) =>
            value > 0 &&
            (key.endsWith('with errors') || key.endsWith('failed')),
    );

const runUploadChangesPhase = async ({
    output,
    label,
    changes,
    action,
    onCount,
}: {
    output: ContentAsCodeOutput;
    label: string;
    changes: Record<string, number>;
    action: () => Promise<Record<string, number>>;
    onCount?: (count: number) => void;
}): Promise<Record<string, number>> => {
    const before = { ...changes };
    output.startItem(label);
    const updatedChanges = await action();
    const summary = summarizeUploadChanges(before, updatedChanges);
    output.completeItem(summary.detail, summary.variant);
    onCount?.(countChangeDelta(before, updatedChanges));
    return updatedChanges;
};

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
): Promise<'upserted' | 'skipped' | 'failed'> => {
    try {
        if (!force && !item.needsUpdating) {
            GlobalState.debug(
                `Skipping ${type} "${item.slug}" with no local changes`,
            );
            changes[`${type} skipped`] = (changes[`${type} skipped`] ?? 0) + 1;
            return 'skipped';
        }
        GlobalState.debug(`Upserting ${type} ${item.slug}`);

        // SQL charts use a different endpoint
        const isSqlChartItem = type === 'charts' && isSqlChartContent(item);
        const endpoint = isSqlChartItem
            ? `/api/v1/projects/${projectId}/code/sqlCharts/${item.slug}`
            : `/api/v1/projects/${projectId}/code/${type}/${item.slug}`;

        const upsertData = await lightdashApi<
            ApiChartAsCodeUpsertResponse['results'] &
                Pick<DashboardAsCodeUpsertResult, 'warnings'>
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
        (upsertData.warnings ?? []).forEach((warning) =>
            GlobalState.log(styles.warning(`  ⚠ ${item.slug}: ${warning}`)),
        );

        // Merge storeUploadChanges result into changes in-place
        const updatedChanges = storeUploadChanges(changes, type, upsertData);
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
        return 'upserted';
    } catch (error: unknown) {
        if (
            error instanceof LightdashError &&
            error.name === 'NotFoundError' &&
            // Only the missing-space NotFoundError counts as a space skip;
            // other NotFoundErrors (e.g. a missing custom chart type) are
            // real failures even with --skip-space-create.
            error.message.startsWith('Space ') &&
            skipSpaceCreate
        ) {
            GlobalState.log(
                styles.warning(
                    `Skipping ${type} "${item.slug}" because space "${item.spaceSlug}" does not exist and --skip-space-create is true`,
                ),
            );
            changes[`${type} skipped`] = (changes[`${type} skipped`] ?? 0) + 1;
            return 'skipped';
        }
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
        return 'failed';
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
    skipSlugs?: ReadonlySet<string>,
): Promise<{
    changes: Record<string, number>;
    total: number;
    failedSlugs: string[];
}> => {
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
        return { changes, total: filteredItems.length, failedSlugs: [] };
    }

    // Items whose dependencies failed earlier in the upload are held back so
    // they are not created in a broken state (e.g. dashboards with null
    // chart tiles).
    const uploadableItems = skipSlugs
        ? filteredItems.filter((item) => !skipSlugs.has(item.slug))
        : filteredItems;
    filteredItems
        .filter((item) => !uploadableItems.includes(item))
        .forEach((item) => {
            changes[`${type} dependency skipped`] =
                (changes[`${type} dependency skipped`] ?? 0) + 1;
            GlobalState.log(
                styles.warning(
                    `Skipped ${type.slice(0, -1)} "${item.slug}" because a chart it references failed to upload`,
                ),
            );
        });

    const failedSlugs: string[] = [];
    const trackOutcome = (
        item: T & { needsUpdating: boolean },
        outcome: 'upserted' | 'skipped' | 'failed',
    ) => {
        if (outcome === 'failed') {
            failedSlugs.push(item.slug);
        }
    };

    if (concurrency <= 1) {
        // Sequential path — preserves original behavior exactly
        for (const item of uploadableItems) {
            // eslint-disable-next-line no-await-in-loop
            const outcome = await upsertSingleItem(
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
            trackOutcome(item, outcome);
        }
    } else {
        // Two-phase parallel path
        // Phase 1: Seed one item per unique spaceSlug (and dashboardSlug for charts)
        // sequentially. This avoids backend race conditions in getOrCreateSpace()
        // and in placeholder dashboard creation for charts within dashboards.
        type ItemWithUpdate = T & { needsUpdating: boolean };
        const grouped = groupBy(
            uploadableItems,
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
            const outcome = await upsertSingleItem(
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
            trackOutcome(item, outcome);
        }

        // Phase 2: Parallel bulk upload of remaining items
        const limit = pLimit(concurrency);
        await Promise.all(
            remainingItems.map((item) =>
                limit(async () => {
                    const outcome = await upsertSingleItem(
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
                    trackOutcome(item, outcome);
                }),
            ),
        );
    }

    return { changes, total: filteredItems.length, failedSlugs };
};

// readCodeFiles walks the whole download folder recursively, so callers that
// need both chart and app slugs should read once and reuse the result.
const readDashboardItems = async (
    customPath?: string,
    looseDashboards: (DashboardAsCode & { needsUpdating: boolean })[] = [],
): Promise<DashboardAsCode[]> => {
    const folderDashboards = await readCodeFiles<DashboardAsCode>(
        'dashboards',
        customPath,
    );
    return [...folderDashboards, ...looseDashboards];
};

const selectDashboards = (
    dashboardItems: DashboardAsCode[],
    dashboardSlugs: string[],
): DashboardAsCode[] =>
    dashboardSlugs.length > 0
        ? dashboardItems.filter((dashboard) =>
              dashboardSlugs.includes(dashboard.slug),
          )
        : dashboardItems;

const selectDashboardChartSlugs = (
    dashboardItems: DashboardAsCode[],
    dashboardSlugs: string[],
): string[] =>
    selectDashboards(dashboardItems, dashboardSlugs).reduce<string[]>(
        (acc, dashboard) => {
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
        },
        [],
    );

const selectDashboardAppSlugs = (
    dashboardItems: DashboardAsCode[],
    dashboardSlugs: string[],
): string[] => [
    ...new Set(
        extractAppSlugsFromDashboards(
            selectDashboards(dashboardItems, dashboardSlugs),
        ),
    ),
];

// Virtual views a filtered upload should carry: the table names of the local
// charts selected explicitly (-c) or referenced by the selected dashboards'
// tiles. Dashboards contribute only when some are selected — a filtered
// upload without -d uploads no dashboards, so there is nothing to derive.
const selectVirtualViewCandidates = ({
    chartItems,
    chartSlugs,
    dashboardItems,
    dashboardSlugs,
}: {
    chartItems: ChartAsCode[];
    chartSlugs: string[];
    dashboardItems: DashboardAsCode[];
    dashboardSlugs: string[];
}): string[] => {
    const selectedChartSlugs = new Set([
        ...chartSlugs,
        ...(dashboardSlugs.length > 0
            ? selectDashboardChartSlugs(dashboardItems, dashboardSlugs)
            : []),
    ]);
    if (selectedChartSlugs.size === 0) return [];
    return extractChartTableNames(
        chartItems.filter((chart) => selectedChartSlugs.has(chart.slug)),
    );
};

const getDashboardChartSlugs = async (
    dashboardSlugs: string[],
    customPath?: string,
    looseDashboards: (DashboardAsCode & { needsUpdating: boolean })[] = [],
): Promise<string[]> =>
    selectDashboardChartSlugs(
        await readDashboardItems(customPath, looseDashboards),
        dashboardSlugs,
    );

const getDashboardAppSlugs = async (
    dashboardSlugs: string[],
    customPath?: string,
    looseDashboards: (DashboardAsCode & { needsUpdating: boolean })[] = [],
): Promise<string[]> =>
    selectDashboardAppSlugs(
        await readDashboardItems(customPath, looseDashboards),
        dashboardSlugs,
    );

// Mirrors the Dashboards phase's own guard: a filtered upload with no
// dashboard slugs uploads no dashboards, so there is nothing to derive from.
const isFilteredWithNoDashboards = (
    hasFilters: boolean,
    dashboardSlugs: string[],
): boolean => hasFilters && dashboardSlugs.length === 0;

const reportOpenDraftsForUpload = async (
    projectUuid: string,
): Promise<void> => {
    try {
        const { openDraftCount } =
            await lightdashApi<ContentAsCodeUploadAdvisory>({
                method: 'GET',
                url: `/api/v1/projects/${projectUuid}/code/upload-advisory`,
                body: undefined,
            });
        if (openDraftCount > 0) {
            GlobalState.log(
                styles.warning(
                    `⚠ ${openDraftCount} open content draft${
                        openDraftCount === 1 ? '' : 's'
                    }. Upload will continue; Git content remains authoritative.`,
                ),
            );
        }
    } catch (error) {
        GlobalState.log(
            styles.warning(
                '⚠ Could not check for open content drafts. Upload will continue.',
            ),
        );
        GlobalState.debug(
            `Could not load content-as-code upload advisory: ${getErrorMessage(
                error,
            )}`,
        );
    }
};

// null when the project dir has no lightdash.config.yml
const readUploadProjectConfig =
    async (): Promise<LightdashProjectConfig | null> => {
        const configExists = await fs
            .access(path.join(process.cwd(), 'lightdash.config.yml'))
            .then(() => true)
            .catch(() => false);
        if (!configExists) return null;
        try {
            return await readAndLoadLightdashProjectConfig(process.cwd());
        } catch (error) {
            throw new LightdashError({
                message: `Upload aborted: lightdash.config.yml exists but could not be read, so the repo's content_as_code settings cannot be honoured. Fix the config and retry. ${getErrorMessage(error)}`,
                name: 'ParseError',
                statusCode: 400,
                data: {},
            });
        }
    };

// The stamped path is the uploaded directory relative to the project dir;
// a directory outside it has no repo path to stamp
const getStampedContentPath = (uploadRoot: string): string | undefined => {
    const relative = path.relative(process.cwd(), uploadRoot);
    if (
        path.isAbsolute(relative) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`)
    ) {
        return undefined;
    }
    return normalizeContentAsCodePath(relative.split(path.sep).join('/'));
};

export const uploadHandler = async (
    options: DownloadHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const projectConfig = await readUploadProjectConfig();
    // --path wins; otherwise content_as_code.path from lightdash.config.yml
    const contentPathOption =
        options.path ?? projectConfig?.content_as_code?.path;

    if (options.spacesOnly && options.skipSpaces) {
        throw new ParameterError(
            'Nothing to upload: --spaces-only cannot be combined with --skip-spaces.',
        );
    }
    if (options.appsOnly && options.spacesOnly) {
        throw new ParameterError(
            '--apps-only cannot be combined with --spaces-only.',
        );
    }
    if (options.appsOnly && options.chartTypesOnly) {
        throw new ParameterError(
            '--apps-only cannot be combined with --chart-types-only.',
        );
    }
    if (options.chartTypesOnly && options.spacesOnly) {
        throw new ParameterError(
            '--chart-types-only cannot be combined with --spaces-only.',
        );
    }
    if (
        options.appsOnly &&
        (options.charts.length > 0 || options.dashboards.length > 0)
    ) {
        throw new ParameterError(
            '--apps-only cannot be combined with --charts or --dashboards.',
        );
    }
    if (
        options.chartTypesOnly &&
        (options.charts.length > 0 || options.dashboards.length > 0)
    ) {
        throw new ParameterError(
            '--chart-types-only cannot be combined with --charts or --dashboards.',
        );
    }
    // Bare --apps-only means "all apps": imply --include-apps.
    if (
        options.appsOnly &&
        options.apps === undefined &&
        options.includeApps !== true
    ) {
        options.includeApps = true;
    }
    if (options.appsOnly) {
        options.chartTypes = undefined;
        options.includeChartTypes = false;
    }
    // Bare --chart-types-only means "all chart types" likewise.
    if (
        options.chartTypesOnly &&
        options.chartTypes === undefined &&
        options.includeChartTypes !== true
    ) {
        options.includeChartTypes = true;
    }
    if (options.chartTypesOnly) {
        options.apps = undefined;
        options.includeApps = false;
    }

    const isOrganizationUpload = options.organization === true;
    // --apps-only / --chart-types-only ride the existing filter machinery:
    // every other phase skips exactly as it does when only those refs are
    // passed.
    const hasFilters =
        hasContentFilters(options) ||
        options.appsOnly === true ||
        options.chartTypesOnly === true;
    const shouldReconcileSpaces =
        !isOrganizationUpload && !options.skipSpaces && !hasFilters;
    let preflightSpaceFiles: SpaceCodeFile[] = [];
    if (shouldReconcileSpaces) {
        try {
            preflightSpaceFiles = await readSpaceFiles(contentPathOption);
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
            customPath: contentPathOption,
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

    await reportOpenDraftsForUpload(projectId);

    // Persist repo-owned sync settings for the review/write-back workflow.
    if (projectConfig) {
        const stamp: ContentAsCodeSettingsStamp = {
            sync: projectConfig.content_as_code?.sync === true,
            path: getStampedContentPath(getDownloadFolder(contentPathOption)),
        };
        try {
            await lightdashApi({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/code/sync-settings`,
                body: JSON.stringify(stamp),
            });
        } catch (error) {
            // Older servers don't have this endpoint; stamping is advisory.
            GlobalState.debug(
                `Could not stamp content-as-code settings: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    let changes: Record<string, number> = {};
    const counts: ProjectContentAsCodeCounts = {};
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
    const uploadRoot = getDownloadFolder(contentPathOption);
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
        if (hasUploadFailures(changes)) {
            GlobalState.log(
                styles.error(
                    'Upload completed with failures — see errors above.',
                ),
            );
            process.exitCode = 1;
        }
    };

    try {
        const spaceFiles = preflightSpaceFiles;
        const spaceNames = shouldReconcileSpaces
            ? getSpaceNames(spaceFiles)
            : await readSpaceNames(contentPathOption);
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
                onCount: (count) => {
                    counts.spacesNum = count;
                },
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
                    ...counts,
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
            action: () => readLooseCodeFiles(contentPathOption),
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

        // The Virtual views, Data apps and Charts phases all derive slugs
        // from the same dashboard YAML; read the download folder once and
        // share it.
        let dashboardItemsPromise: Promise<DashboardAsCode[]> | undefined;
        const loadDashboardItems = () => {
            dashboardItemsPromise =
                dashboardItemsPromise ??
                readDashboardItems(contentPathOption, looseFiles.dashboards);
            return dashboardItemsPromise;
        };

        if (!options.skipVirtualViews) {
            // --include-virtual-views on a filtered upload also pushes the
            // virtual views backing the selected charts and dashboards. An
            // unfiltered upload already pushes every local virtual view.
            let virtualViewCandidates: string[] = [];
            if (
                options.includeVirtualViews === true &&
                hasFilters &&
                (options.charts.length > 0 || options.dashboards.length > 0)
            ) {
                virtualViewCandidates = selectVirtualViewCandidates({
                    chartItems: [
                        ...(await readCodeFiles<ChartAsCode>(
                            'charts',
                            contentPathOption,
                        )),
                        ...looseFiles.charts,
                    ],
                    chartSlugs: options.charts,
                    dashboardItems:
                        options.dashboards.length > 0
                            ? await loadDashboardItems()
                            : [],
                    dashboardSlugs: options.dashboards,
                });
            }
            if (
                hasFilters &&
                options.virtualViews.length === 0 &&
                virtualViewCandidates.length === 0
            ) {
                GlobalState.log(
                    styles.warning(
                        options.includeVirtualViews === true
                            ? `No virtual views referenced by the selected content, skipping`
                            : `No virtual view filters provided, skipping`,
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
                            contentPathOption,
                            virtualViewCandidates,
                        ),
                    onCount: (count) => {
                        counts.virtualViewsNum = count;
                    },
                });
            }
        }

        // Apps resolve their external connection links by slug in the target
        // project, so connections must exist before any app is uploaded.
        if (!options.skipExternalConnections) {
            if (hasFilters && options.externalConnections.length === 0) {
                GlobalState.log(
                    styles.warning(
                        `No external connection filters provided, skipping`,
                    ),
                );
            } else {
                changes = await runUploadChangesPhase({
                    output,
                    label: 'External connections',
                    changes,
                    action: () =>
                        upsertExternalConnections(
                            projectId,
                            options.externalConnections,
                            changes,
                            options.force,
                            uploadPermissions.externalConnections,
                            contentPathOption,
                        ),
                    onCount: (count) => {
                        counts.externalConnectionsNum = count;
                    },
                });
            }
        }

        // Upload data apps and custom chart types (enterprise). Data apps:
        // explicit --apps/--include-apps, or auto-pushed for a dashboard's
        // apps; must land before dashboards. Chart types: explicit
        // --chart-types/--include-chart-types, from their own folder.
        const explicitAppReferences = Array.isArray(options.apps)
            ? options.apps
            : [];
        const isExplicitAppSelection =
            options.includeApps === true || explicitAppReferences.length > 0;
        const autoPushAppSlugs = isFilteredWithNoDashboards(
            hasFilters,
            options.dashboards,
        )
            ? []
            : selectDashboardAppSlugs(
                  await loadDashboardItems(),
                  options.dashboards,
              );
        const explicitChartTypeReferences = Array.isArray(options.chartTypes)
            ? options.chartTypes
            : [];
        const isExplicitChartTypeSelection =
            options.includeChartTypes === true ||
            explicitChartTypeReferences.length > 0;
        const appsPhaseActive =
            isExplicitAppSelection || autoPushAppSlugs.length > 0;

        type BundleUploadPhase = {
            label: string; // output phase label
            noun: string; // singular, for messages
            changesPrefix: string; // changes summary key prefix
            dirName: string; // folder under the download root
            explicitRefs: string[];
            includeAllFolders: boolean;
            isExplicitSelection: boolean;
            autoPushSlugs: string[]; // dashboard-referenced apps; [] for chart types
            useAppSpace: boolean; // --app-space applies (chart types are spaceless)
            isChartTypes: boolean;
        };
        const bundleUploadPhases: BundleUploadPhase[] = [
            {
                label: 'Data apps',
                noun: 'data app',
                changesPrefix: 'data apps',
                dirName: 'apps',
                explicitRefs: explicitAppReferences,
                includeAllFolders: options.includeApps === true,
                isExplicitSelection: isExplicitAppSelection,
                autoPushSlugs: autoPushAppSlugs,
                useAppSpace: true,
                isChartTypes: false,
            },
            {
                label: 'Custom chart types',
                noun: 'custom chart type',
                changesPrefix: 'chart types',
                dirName: 'chart-types',
                explicitRefs: explicitChartTypeReferences,
                includeAllFolders: options.includeChartTypes === true,
                isExplicitSelection: isExplicitChartTypeSelection,
                autoPushSlugs: [],
                useAppSpace: false,
                isChartTypes: true,
            },
        ];

        for (const phase of bundleUploadPhases) {
            const shouldUploadPhase =
                phase.isExplicitSelection || phase.autoPushSlugs.length > 0;
            if (!shouldUploadPhase) {
                // eslint-disable-next-line no-continue
                continue;
            }

            let appsCreated = 0;
            let appsUpdated = 0;
            let appsUnchanged = 0;
            let appsFailed = 0;
            let appsSkipped = 0;
            let eeAppRoutesUnavailable = false;
            const changesBeforeApps = { ...changes };

            if (!uploadPermissions.dataApps) {
                if (phase.isChartTypes) {
                    counts.chartTypesNum = 0;
                } else {
                    counts.appsNum = 0;
                }
                output.startItem(phase.label);
                GlobalState.log(
                    styles.warning(
                        `Skipping ${phase.changesPrefix}: create:DataApp or manage:DataApp permission is required for this project (the create:DataApp@preview and manage:DataApp@preview scopes only cover preview projects you created). Dashboard tiles will resolve only if their apps already exist in this project.`,
                    ),
                );
                output.completeItem('permission denied', 'warning');
                // eslint-disable-next-line no-continue
                continue;
            }
            output.startItem(phase.label);
            // Explicit refs filter by slug/appUuid; include-all uploads every
            // folder. A pure auto-push run applies no filter — gated per
            // folder below.
            let uploadFilter = phase.isExplicitSelection
                ? getDataAppUploadFilter(
                      phase.explicitRefs,
                      phase.includeAllFolders,
                  )
                : null;

            // uuid/URL --apps refs resolve to slugs against the target
            // project's listing so they can match slug-identity local folders.
            const filterHasUuidRefs =
                uploadFilter !== null && [...uploadFilter].some(isUuid);
            if (filterHasUuidRefs && uploadFilter !== null) {
                try {
                    const projectApps = await lightdashApi<
                        ApiEmbedProjectAppsResponse['results']
                    >({
                        method: 'GET',
                        // Each kind resolves against its own listing — the
                        // apps listing never includes chart types.
                        url: `/api/v1/ee/projects/${projectId}/apps${
                            phase.isChartTypes ? '/chart-types' : ''
                        }`,
                        body: undefined,
                    });
                    uploadFilter = resolveUploadFilterUuids(
                        uploadFilter,
                        projectApps,
                    );
                } catch (listErr) {
                    GlobalState.debug(
                        `Could not list target project apps: ${getErrorMessage(listErr)}`,
                    );
                }
            }

            // The server applies the space on creates only; existing apps
            // keep their space. Chart types are spaceless, so --app-space
            // never applies to them.
            let appSpaceUuid: string | undefined;
            if (phase.useAppSpace && options.appSpace !== undefined) {
                if (isUuid(options.appSpace)) {
                    appSpaceUuid = options.appSpace;
                } else {
                    const spaces = await lightdashApi<
                        ApiSpaceSummaryListResponse['results']
                    >({
                        method: 'GET',
                        url: `/api/v1/projects/${projectId}/spaces`,
                        body: undefined,
                    });
                    appSpaceUuid = resolveAppSpaceUuid(
                        options.appSpace,
                        spaces,
                    );
                }
            } else if (
                phase.isChartTypes &&
                options.appSpace !== undefined &&
                !appsPhaseActive
            ) {
                GlobalState.log(
                    styles.warning(
                        '--app-space does not apply to custom chart types — they are project-global and spaceless.',
                    ),
                );
            }

            const baseDir = getDownloadFolder(contentPathOption);
            const appsDir = path.join(baseDir, phase.dirName);

            let appFolderEntries: import('fs').Dirent[];
            try {
                appFolderEntries = await fs.readdir(appsDir, {
                    withFileTypes: true,
                });
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                    appFolderEntries = [];
                } else {
                    throw err;
                }
            }

            const subDirs = appFolderEntries.filter((e) => e.isDirectory());

            if (subDirs.length === 0) {
                if (phase.isChartTypes) {
                    GlobalState.log(
                        styles.warning(
                            `No chart type folders found in ${appsDir}. Run 'lightdash download --include-chart-types' first.`,
                        ),
                    );
                } else {
                    GlobalState.log(
                        styles.warning(
                            phase.isExplicitSelection
                                ? `No app folders found in ${appsDir}. Run 'lightdash download --include-apps' first.`
                                : `No app folders found in ${appsDir} for the dashboard(s) being uploaded. Re-run 'lightdash download' to fetch their apps.`,
                        ),
                    );
                }
            }

            const matchedRefs = new Set<string>();
            const buildWaitState = createBuildLimitWaitState();
            for (const subDir of subDirs) {
                const folderPath = path.join(appsDir, subDir.name);
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const code = await readBundleFromDir(folderPath);

                    if (!uploadFilterMatches(uploadFilter, code.manifest)) {
                        const isAutoPushCandidate =
                            code.manifest.slug !== undefined &&
                            phase.autoPushSlugs.includes(code.manifest.slug);
                        if (isAutoPushCandidate) {
                            GlobalState.log(
                                styles.warning(
                                    `Skipping app "${subDir.name}" — excluded by --apps, but a dashboard being uploaded references it. Its tile may fail to resolve unless the app already exists in the target project.`,
                                ),
                            );
                        } else {
                            GlobalState.debug(
                                `Skipping ${phase.noun} folder "${subDir.name}" (not in filter)`,
                            );
                        }
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                    if (uploadFilter) {
                        matchedUploadRefs(uploadFilter, code.manifest).forEach(
                            (ref) => matchedRefs.add(ref),
                        );
                    }

                    // Folder-kind guard: the manifest governs what the server
                    // creates, so a bundle filed under the wrong folder would
                    // silently upload as the wrong kind. Skip and say where
                    // it belongs instead.
                    const isVizBundle =
                        code.manifest.template === DATA_APP_VIZ_TEMPLATE;
                    if (isVizBundle !== phase.isChartTypes) {
                        GlobalState.log(
                            styles.warning(
                                isVizBundle
                                    ? `Skipping "${subDir.name}": it is a custom chart type — move the folder to chart-types/ and upload with --chart-types or --include-chart-types.`
                                    : `Skipping "${subDir.name}": it is a data app — move the folder to apps/ and upload with --apps or --include-apps.`,
                            ),
                        );
                        appsSkipped += 1;
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    if (!phase.isExplicitSelection) {
                        const isAutoPushCandidate =
                            code.manifest.slug !== undefined &&
                            phase.autoPushSlugs.includes(code.manifest.slug);
                        if (!isAutoPushCandidate) {
                            // eslint-disable-next-line no-continue
                            continue;
                        }
                        // Auto-push candidates always POST: the server's
                        // byte-compare skip is the single unchanged authority,
                        // and it runs before the build cap, so identical apps
                        // cost no build slots.
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
                                        rawDeps.hasNpmLockfile
                                            ? `Skipping "${subDir.name}": custom dependencies require a pnpm lockfile — the server builds with pnpm, so package-lock.json is not used. Run 'pnpm install' in the app folder to generate pnpm-lock.yaml, then upload again.`
                                            : `Skipping "${subDir.name}": it declares custom dependencies but has no pnpm-lock.yaml (the server builds with pnpm). Run 'pnpm install' in the app folder to generate one, then upload again.`,
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

                            if (options.allowCustomDependencies !== true) {
                                const canPrompt =
                                    process.stdin.isTTY === true &&
                                    process.stdout.isTTY === true &&
                                    !GlobalState.isNonInteractive();
                                if (!canPrompt) {
                                    // Fail closed: installing packages in the
                                    // build sandbox needs explicit approval.
                                    GlobalState.log(
                                        styles.error(
                                            `Skipping "${subDir.name}": it declares custom dependencies, which need approval. Pass --allow-custom-dependencies to approve in non-interactive runs.`,
                                        ),
                                    );
                                    appsFailed += 1;
                                    // eslint-disable-next-line no-continue
                                    continue;
                                }
                                // eslint-disable-next-line no-await-in-loop
                                const { proceed } =
                                    await output.promptWhilePaused(() =>
                                        inquirer.prompt<{
                                            proceed: boolean;
                                        }>([
                                            {
                                                type: 'confirm',
                                                name: 'proceed',
                                                message: `Upload "${subDir.name}" with custom dependencies?`,
                                                default: false,
                                            },
                                        ]),
                                    );
                                if (!proceed) {
                                    GlobalState.log(
                                        `Skipped "${subDir.name}" (custom dependency upload declined).`,
                                    );
                                    appsSkipped += 1;
                                    // eslint-disable-next-line no-continue
                                    continue;
                                }
                            }

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
                        space: appSpaceUuid,
                        createNew: options.createNew === true,
                        force: options.force,
                    });

                    // eslint-disable-next-line no-await-in-loop
                    const { appUuid, version, action, slug, warnings } =
                        await withBuildLimitRetry(
                            () =>
                                lightdashApi<
                                    ApiImportAppCodeResponse['results']
                                >({
                                    method: 'POST',
                                    url: `/api/v1/ee/projects/${projectId}/apps/upload`,
                                    body: JSON.stringify(body),
                                }),
                            buildWaitState,
                            {
                                onWait: (attempt, delayMs) => {
                                    if (attempt === 1) {
                                        GlobalState.log(
                                            styles.warning(
                                                `Project build limit reached — waiting for builds to finish before uploading "${subDir.name}"…`,
                                            ),
                                        );
                                    }
                                    GlobalState.debug(
                                        `> Build cap retry ${attempt} for "${subDir.name}" in ${delayMs}ms`,
                                    );
                                },
                            },
                        );

                    // e.g. a manifest external-connection link whose slug is
                    // missing in the target project was skipped
                    (warnings ?? []).forEach((warning) =>
                        GlobalState.log(styles.warning(warning)),
                    );

                    if (action === 'unchanged') {
                        appsUnchanged += 1;
                        GlobalState.log(
                            styles.secondary(
                                `"${code.manifest.name}" matches v${version} — skipped, no rebuild. Pass --force to rebuild anyway.`,
                            ),
                        );
                    } else {
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
                    }

                    if (code.manifest.slug === undefined) {
                        GlobalState.log(
                            styles.warning(
                                preSlugUploadHint({
                                    folder: subDir.name,
                                    slug,
                                }),
                            ),
                        );
                    } else if (slug === undefined) {
                        // Bundle sent a slug but the response has none: the
                        // server predates slug identity and matched by uuid
                        // only (slug-only bundles may have just duplicated).
                        GlobalState.log(
                            styles.warning(preSlugServerHint(subDir.name)),
                        );
                    }

                    if (action === 'create') {
                        GlobalState.log(
                            phase.isChartTypes
                                ? `New chart type: ${config.context.serverUrl}/projects/${projectId}/chart-types/${appUuid}`
                                : `New app: ${config.context.serverUrl}/projects/${projectId}/apps/${appUuid}`,
                        );
                    }
                } catch (appErr) {
                    const status =
                        appErr instanceof LightdashError
                            ? appErr.statusCode
                            : undefined;
                    // Auto-push is flag-free, so a server without the EE app
                    // routes must not fail an upload the user never asked for.
                    if (!phase.isExplicitSelection && status === 404) {
                        eeAppRoutesUnavailable = true;
                        GlobalState.log(
                            styles.warning(
                                `Skipping data apps: the enterprise "data apps" feature is not available on this instance. Dashboard tiles will resolve only if their apps already exist in this project.`,
                            ),
                        );
                        break;
                    }
                    appsFailed += 1;
                    let hint = '';
                    if (status === 404) {
                        hint =
                            ' — the enterprise "data apps" feature may not be enabled on this instance';
                    } else if (status === 429) {
                        hint =
                            ' — gave up waiting for a free build slot; re-run the upload once builds finish (unchanged apps are skipped)';
                    }
                    GlobalState.log(
                        styles.error(
                            `Failed to upload app folder "${subDir.name}"${
                                status ? ` [HTTP ${status}]` : ''
                            }: ${getErrorMessage(appErr)}${hint}`,
                        ),
                    );
                }
            }

            if (uploadFilter) {
                const unmatchedWarning = unmatchedUploadRefsWarning(
                    [...uploadFilter].filter((ref) => !matchedRefs.has(ref)),
                    phase.noun,
                );
                if (unmatchedWarning) {
                    GlobalState.log(styles.warning(unmatchedWarning));
                }
            }

            if (appsCreated > 0)
                changes[`${phase.changesPrefix} created`] = appsCreated;
            if (appsUpdated > 0)
                changes[`${phase.changesPrefix} updated`] = appsUpdated;
            if (appsUnchanged > 0)
                changes[`${phase.changesPrefix} unchanged`] = appsUnchanged;
            if (appsFailed > 0)
                changes[`${phase.changesPrefix} failed`] = appsFailed;
            if (appsSkipped > 0)
                changes[`${phase.changesPrefix} skipped`] = appsSkipped;
            const phaseBundleTotal =
                appsCreated +
                appsUpdated +
                appsUnchanged +
                appsFailed +
                appsSkipped;
            if (phase.isChartTypes) {
                counts.chartTypesNum = phaseBundleTotal;
            } else {
                counts.appsNum = phaseBundleTotal;
            }
            const appSummary = summarizeUploadChanges(
                changesBeforeApps,
                changes,
            );
            if (eeAppRoutesUnavailable) {
                output.completeItem('not available on this server', 'warning');
            } else {
                output.completeItem(appSummary.detail, appSummary.variant);
            }

            if (appsFailed > 0) {
                // App uploads are fire-and-forget per folder, so failures are
                // logged and tallied rather than thrown — but the process must
                // still exit non-zero or CI pipelines read the run as green.
                GlobalState.log(
                    styles.error(
                        `${appsFailed} ${phase.noun} upload(s) failed — see errors above.`,
                    ),
                );
                process.exitCode = 1;
            }
        }

        // Chart slugs that failed to upload in the Charts phase; dashboards
        // referencing them are held back so they are not created with broken
        // (null chart) tiles.
        const failedChartSlugs = new Set<string>();

        changes = await runUploadChangesPhase({
            output,
            label: 'Charts',
            changes,
            action: async () => {
                const chartSlugs = options.includeCharts
                    ? Array.from(
                          new Set([
                              ...options.charts,
                              ...selectDashboardChartSlugs(
                                  await loadDashboardItems(),
                                  options.dashboards,
                              ),
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
                    contentPathOption,
                    options.skipSpaceCreate,
                    options.public,
                    options.validate,
                    concurrency,
                    looseFiles.charts,
                    spaceNames,
                );
                result.failedSlugs.forEach((slug) =>
                    failedChartSlugs.add(slug),
                );
                counts.chartsNum = result.total;
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
                let dashboardsToSkip: Set<string> | undefined;
                if (failedChartSlugs.size > 0) {
                    dashboardsToSkip = new Set(
                        (await loadDashboardItems())
                            .filter((dashboard) =>
                                dashboard.tiles.some(
                                    (tile) =>
                                        'chartSlug' in tile.properties &&
                                        typeof tile.properties.chartSlug ===
                                            'string' &&
                                        failedChartSlugs.has(
                                            tile.properties.chartSlug,
                                        ),
                                ),
                            )
                            .map((dashboard) => dashboard.slug),
                    );
                }
                const result = await upsertResources<DashboardAsCode>(
                    'dashboards',
                    projectId,
                    changes,
                    options.force,
                    options.dashboards,
                    uploadPermissions.dashboards,
                    contentPathOption,
                    options.skipSpaceCreate,
                    options.public,
                    options.validate,
                    concurrency,
                    looseFiles.dashboards,
                    spaceNames,
                    dashboardsToSkip,
                );
                counts.dashboardsNum = result.total;
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
                                contentPathOption,
                                options.agents.length === 0,
                            ),
                        onCount: (count) => {
                            counts.agentsNum = count;
                        },
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
                            contentPathOption,
                        ),
                    onCount: (count) => {
                        counts.alertsNum = count;
                    },
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
                            contentPathOption,
                        ),
                    onCount: (count) => {
                        counts.scheduledDeliveriesNum = count;
                    },
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
                            contentPathOption,
                        ),
                    onCount: (count) => {
                        counts.googleSheetsNum = count;
                    },
                });
            }
        }

        const end = Date.now();

        await LightdashAnalytics.track({
            event: 'upload.completed',
            properties: {
                userId: config.user?.userUuid,
                organizationId: config.user?.organizationUuid,
                projectId,
                ...counts,
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
        if (error instanceof AiAgentAsCodeUploadError)
            throw error.originalError;
        throw error;
    }
};

export const testHelpers = {
    assertUniqueSpacePaths,
    countChangeDelta,
    downloadLinkedVirtualViews,
    downloadSpaces,
    extractAppSlugsFromDashboards,
    extractChartTableNames,
    extractChartTypeRefsFromCharts,
    getFlatSpaceFileNames,
    getDashboardAppSlugs,
    getDashboardChartSlugs,
    hasContentFilters,
    isAiAgentsUnavailableError,
    isExternalConnectionsUnavailableError,
    isVirtualViewsUnavailableError,
    downloadAiAgents,
    isFilteredWithNoDashboards,
    readAiAgentFiles,
    readExternalConnectionFiles,
    readSpaceFiles,
    readSpaceNames,
    reportOpenDraftsForUpload,
    sanitizeChartForDownload,
    selectVirtualViewCandidates,
    shouldFallBackToEmbeddedSpaces,
    shouldDownloadAiAgents,
    sortSpaceFilesParentFirst,
    summarizeUploadChanges,
    upsertAiAgents,
    upsertExternalConnections,
    upsertResources,
    upsertSpaces,
    upsertVirtualViews,
    validateSpaceIdentity,
    writeSpaceFiles,
};
