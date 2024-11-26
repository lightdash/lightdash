/* eslint-disable no-await-in-loop */
import { AuthorizationError, SavedChart, SpaceQuery } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

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

    // Get all saved charts
    const chartSummaries = await lightdashApi<SpaceQuery[]>({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/charts`,
        body: undefined,
    });

    console.info(`Downloading ${chartSummaries.length} charts`);

    const charts: SavedChart[] = [];
    for (const chartSummary of chartSummaries) {
        // Return any type so we can delete extra properties later on
        const chartData = await lightdashApi<SavedChart>({
            method: 'GET',
            url: `/api/v1/saved/${chartSummary.uuid}`,
            body: undefined,
        });
        // TODO these should get removed in the backend API

        // Delete extra properties from chart
        // only keep the ones we can handle later on update
        delete chartData.updatedByUser;

        charts.push(chartData);
    }

    const outputDir = path.join(process.cwd(), 'lightdash');
    console.info(`Creating new path for files on ${outputDir} `);

    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
        // Directory already exists
    }

    for (const chart of charts) {
        const chartPath = path.join(outputDir, `${chart.slug}.json`);
        GlobalState.debug(`> Writing chart to ${chartPath}`);
        await fs.writeFile(chartPath, JSON.stringify(chart, null, 2));
    }

    // TODO delete files if chart don't exist ?
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

    const inputDir = path.join(process.cwd(), 'lightdash');
    console.info(`Reading charts from ${inputDir}`);

    const charts: SavedChart[] = [];
    try {
        // Read all files from the lightdash directory
        const files = await fs.readdir(inputDir);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));

        // Load each JSON file
        for (const file of jsonFiles) {
            const filePath = path.join(inputDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const chart = JSON.parse(fileContent);
            charts.push(chart);
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

    for (const chart of charts) {
        // TODO update chart name, description, spaceUuid
        /* const chartData = await lightdashApi({
            method: 'PATCH',
            url: `/api/v1/projects/${projectId}/saved/${chart.uuid}`,
            body: JSON.stringify(chart),
        });
        console.info(`updated chart ${chartData}`) */

        // Create chart version
        const chartVersion = await lightdashApi({
            method: 'POST',
            url: `/api/v1/saved/${chart.uuid}/version`,
            body: JSON.stringify(chart),
        });
        console.info(`created chart version ${JSON.stringify(chartVersion)}`);
    }
};
