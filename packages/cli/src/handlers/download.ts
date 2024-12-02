/* eslint-disable no-await-in-loop */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    AuthorizationError,
    ChartAsCode,
    PromotionAction,
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
    const chartsAsCode = await lightdashApi<
        ApiChartAsCodeListResponse['results']
    >({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/charts/code`,
        body: undefined,
    });
    console.info(`Downloading ${chartsAsCode.length} charts`);

    const outputDir = path.join(process.cwd(), DOWNLOAD_FOLDER);
    console.info(`Creating new path for files on ${outputDir} `);

    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
        // Directory already exists
    }

    for (const chart of chartsAsCode) {
        const chartPath = path.join(outputDir, `${chart.slug}.yml`);
        GlobalState.debug(`> Writing chart to ${chartPath}`);
        const chartYml = yaml.dump(chart, {
            quotingType: '"',
        });
        await fs.writeFile(chartPath, chartYml);
    }

    // TODO delete files if chart don't exist ?*/
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

    const inputDir = path.join(process.cwd(), DOWNLOAD_FOLDER);
    console.info(`Reading charts from ${inputDir}`);

    const charts: (ChartAsCode & { needsUpdating: boolean })[] = [];
    try {
        // Read all files from the lightdash directory
        const files = await fs.readdir(inputDir);
        const jsonFiles = files.filter((file) => file.endsWith('.yml'));

        // Load each JSON file
        for (const file of jsonFiles) {
            const filePath = path.join(inputDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const chart = yaml.load(fileContent) as ChartAsCode;

            const fileUpdatedAt = (await fs.stat(filePath)).mtime;
            // We override the updatedAt to the file's updatedAt
            // in case there were some changes made locally
            // do not override if the file was just created
            const downloadedAt = chart.downloadedAt
                ? new Date(chart.downloadedAt)
                : undefined;
            const needsUpdating =
                downloadedAt &&
                Math.abs(fileUpdatedAt.getTime() - downloadedAt.getTime()) >
                    30000;

            const locallyUpdatedChart = {
                ...chart,
                updatedAt: needsUpdating ? fileUpdatedAt : chart.updatedAt, // Force the update by changing updatedAt , which is what promotion is going to compare
                needsUpdating: needsUpdating ?? true, // if downloadAt is not set, we force the update
            };
            charts.push(locallyUpdatedChart);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
                `Directory ${inputDir} not found. Run download command first.`,
            );
        }
        throw error;
    }

    console.info(`Found ${charts.length} chart files`);

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let skipped = 0;
    let spacesCreated = 0;
    let spacesUpdated = 0;
    try {
        for (const chart of charts) {
            if (!chart.needsUpdating) {
                GlobalState.debug(
                    `Skipping chart "${chart.slug}" with no local changes`,
                );
                skipped += 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            GlobalState.debug(`Upserting chart ${chart.slug}`);
            const chartData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/charts/${chart.slug}/code`,
                body: JSON.stringify(chart),
            });

            GlobalState.debug(
                `Chart "${chart.name}": ${chartData.charts[0].action}`,
            );
            switch (chartData.spaces[0].action) {
                case PromotionAction.CREATE:
                    spacesCreated += 1;
                    break;
                case PromotionAction.UPDATE:
                    spacesUpdated += 1;
                    break;
                default:
                // ignore the rest
            }
            switch (chartData.charts[0].action) {
                case PromotionAction.CREATE:
                    created += 1;
                    break;
                case PromotionAction.UPDATE:
                    updated += 1;
                    break;
                case PromotionAction.DELETE:
                    deleted += 1;
                    break;
                case PromotionAction.NO_CHANGES:
                    skipped += 1;
                    break;
                default:
                    GlobalState.debug(
                        `Unknown action: ${chartData.charts[0].action}`,
                    );
                    break;
            }
        }
    } catch (error) {
        console.error('Error upserting chart', error);
    }
    console.info(`Total charts created: ${created} `);
    console.info(`Total charts updated: ${updated} `);
    console.info(`Total charts skipped: ${skipped} `);
    if (deleted > 0) console.info(`Total charts deleted: ${deleted} `); // We should not delete charts from the CLI

    console.info(`Total spaces created: ${spacesCreated} `);
    console.info(`Total spaces updated: ${spacesUpdated} `);
};
