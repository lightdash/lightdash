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
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

const DOWNLOAD_FOLDER = 'lightdash';
export type DownloadHandlerOptions = {
    verbose: boolean;
    force: boolean;
};

const dumpIntoFiles = async (
    folder: 'charts' | 'dashboards',
    items: (ChartAsCode | DashboardAsCode)[],
) => {
    const outputDir = path.join(process.cwd(), DOWNLOAD_FOLDER, folder);

    console.info(`Writting ${items.length} ${folder} into ${outputDir}`);
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

    // Download charts
    GlobalState.debug('Downloading charts');
    const chartsAsCode = await lightdashApi<
        ApiChartAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/charts/code`,
        body: undefined,
    });
    await dumpIntoFiles('charts', chartsAsCode);

    // Download dashboards
    GlobalState.debug('Downloading dashboards');
    const dashboardsAsCode = await lightdashApi<
        ApiDashboardAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/dashboards/code`,
        body: undefined,
    });

    await dumpIntoFiles('dashboards', dashboardsAsCode);

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

const upsertResources = async <T extends ChartAsCode | DashboardAsCode>(
    type: 'charts' | 'dashboards',
    projectId: string,
    changes: Record<string, number>,
    force: boolean,
) => {
    const items = await readCodeFiles<T>(type);

    console.info(`Found ${items.length} ${type} files`);
    for (const item of items) {
        // If a chart fails to update, we keep updating the rest
        try {
            if (!force && !item.needsUpdating) {
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
    );
    changes = await upsertResources<DashboardAsCode>(
        'dashboards',
        projectId,
        changes,
        options.force,
    );

    logUploadChanges(changes);
};
