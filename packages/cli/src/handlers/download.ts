/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiDashboardAsCodeListResponse,
    AuthorizationError,
    ChartAsCode,
    DashboardAsCode,
    PromotionAction,
    PromotionChanges,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

const DOWNLOAD_FOLDER = 'lightdash';
export type DownloadHandlerOptions = {
    verbose: boolean;
    charts: string[]; // These can be slugs, uuids or urls
    dashboards: string[]; // These can be slugs, uuids or urls
    force: boolean;
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

const dumpIntoFiles = async (
    folder: 'charts' | 'dashboards',
    items: (ChartAsCode | DashboardAsCode)[],
) => {
    const outputDir = path.join(process.cwd(), DOWNLOAD_FOLDER, folder);

    GlobalState.debug(`Writing ${items.length} ${folder} into ${outputDir}`);
    // Make directory
    const created = await fs.mkdir(outputDir, { recursive: true });
    if (created) console.info(`Created new folder: ${outputDir} `);

    for (const item of items) {
        const itemPath = path.join(outputDir, `${item.slug}.yml`);
        const chartYml = yaml.dump(item, {
            quotingType: '"',
        });
        await fs.writeFile(itemPath, chartYml);
    }
};

const readCodeFiles = async <T extends ChartAsCode | DashboardAsCode>(
    folder: 'charts' | 'dashboards',
): Promise<(T & { needsUpdating: boolean })[]> => {
    const inputDir = path.join(process.cwd(), DOWNLOAD_FOLDER, folder);

    console.info(`Reading ${folder} from ${inputDir}`);
    const items: (T & { needsUpdating: boolean })[] = [];
    try {
        // Read all files from the lightdash directory
        const files = await fs.readdir(inputDir);
        const jsonFiles = files.filter((file) => file.endsWith('.yml'));

        // Load each JSON file
        for (const file of jsonFiles) {
            const filePath = path.join(inputDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const item = yaml.load(fileContent) as T;

            const fileUpdatedAt = (await fs.stat(filePath)).mtime;
            // We override the updatedAt to the file's updatedAt
            // in case there were some changes made locally
            // do not override if the file was just created
            const downloadedAt = item.downloadedAt
                ? new Date(item.downloadedAt)
                : undefined;
            const needsUpdating =
                downloadedAt &&
                Math.abs(fileUpdatedAt.getTime() - downloadedAt.getTime()) >
                    30000;

            const locallyUpdatedItem = {
                ...item,
                updatedAt: needsUpdating ? fileUpdatedAt : item.updatedAt, // Force the update by changing updatedAt , which is what promotion is going to compare
                needsUpdating: needsUpdating ?? true, // if downloadAt is not set, we force the update
            };
            items.push(locallyUpdatedItem);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.error(
                `Directory ${inputDir} not found. Run download command first.`,
            );
        } else {
            console.error(`Error reading ${inputDir}: ${error}`);
        }
        throw error;
    }

    return items;
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

    const projectId = config.context.project;
    if (!projectId) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    // If any filter is provided, we skip those items without filters
    // eg: if a --charts filter is provided, we skip dashboards if no --dashboards filter is provided
    const hasFilters =
        options.charts.length > 0 || options.dashboards.length > 0;

    // Download charts
    if (hasFilters && options.charts.length === 0) {
        console.info(styles.warning(`No charts filters provided, skipping`));
    } else {
        const spinner = GlobalState.startSpinner(`Downloading charts`);
        const chartFilters = parseContentFilters(options.charts);
        let chartsAsCode: ApiChartAsCodeListResponse['results'];
        let offset = 0;
        do {
            GlobalState.debug(
                `Downloading charts with offset "${offset}" and filters "${chartFilters}"`,
            );

            const queryParams = chartFilters
                ? `${chartFilters}&offset=${offset}`
                : `?offset=${offset}`;
            chartsAsCode = await lightdashApi<
                ApiChartAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/charts/code${queryParams}`,
                body: undefined,
            });
            spinner.start(
                `Downloaded ${chartsAsCode.offset} of ${chartsAsCode.total} charts`,
            );
            chartsAsCode.missingIds.forEach((missingId) => {
                console.warn(styles.warning(`No chart with id "${missingId}"`));
            });

            await dumpIntoFiles('charts', chartsAsCode.charts);
            offset = chartsAsCode.offset;
        } while (chartsAsCode.offset < chartsAsCode.total);

        spinner.succeed(`Downloaded ${chartsAsCode.total} charts`);
    }

    // Download dashboards
    if (hasFilters && options.dashboards.length === 0) {
        console.info(
            styles.warning(`No dashboards filters provided, skipping`),
        );
    } else {
        const spinner = GlobalState.startSpinner(`Downloading dashboards`);

        const dashboardFilters = parseContentFilters(options.dashboards);
        let offset = 0;

        let dashboardsAsCode: ApiDashboardAsCodeListResponse['results'];
        do {
            GlobalState.debug(
                `Downloading dashboards with offset "${offset}" and filters "${dashboardFilters}"`,
            );

            const queryParams = dashboardFilters
                ? `${dashboardFilters}&offset=${offset}`
                : `?offset=${offset}`;
            dashboardsAsCode = await lightdashApi<
                ApiDashboardAsCodeListResponse['results']
            >({
                method: 'GET',
                url: `/api/v1/projects/${projectId}/dashboards/code${queryParams}`,
                body: undefined,
            });

            dashboardsAsCode.missingIds.forEach((missingId) => {
                console.warn(
                    styles.warning(`No dashboard with id "${missingId}"`),
                );
            });
            spinner?.start(
                `Downloaded ${dashboardsAsCode.offset} of ${dashboardsAsCode.total} dashboards`,
            );

            await dumpIntoFiles('dashboards', dashboardsAsCode.dashboards);
            offset = dashboardsAsCode.offset;
        } while (dashboardsAsCode.offset < dashboardsAsCode.total);

        spinner.succeed(`Downloaded ${dashboardsAsCode.total} dashboards`);
    }

    // TODO delete files if chart don't exist ?*/
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
                const action =
                    promoteChange.action === PromotionAction.NO_CHANGES
                        ? 'skipped'
                        : promoteChange.action;
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
) => {
    const items = await readCodeFiles<T>(type);

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
            const upsertData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/${type}/${item.slug}/code`,
                body: JSON.stringify(item),
            });

            GlobalState.debug(
                `${type} "${item.name}": ${upsertData[type]?.[0].action}`,
            );

            changes = storeUploadChanges(changes, upsertData);
        } catch (error) {
            changes[`${type} with errors`] =
                (changes[`${type} with errors`] ?? 0) + 1;
            console.error(`Error upserting ${type}`, error);
        }
    }
    return changes;
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

    const projectId = config.context.project;
    if (!projectId) {
        throw new Error(
            'No project selected. Run lightdash config set-project',
        );
    }

    let changes: Record<string, number> = {};

    changes = await upsertResources<ChartAsCode>(
        'charts',
        projectId,
        changes,
        options.force,
        options.charts,
    );
    changes = await upsertResources<DashboardAsCode>(
        'dashboards',
        projectId,
        changes,
        options.force,
        options.dashboards,
    );

    logUploadChanges(changes);
};
