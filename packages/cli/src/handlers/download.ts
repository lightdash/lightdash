/* eslint-disable no-await-in-loop */
import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    AuthorizationError,
    ChartAsCode,
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

    const charts: ChartAsCode[] = [];
    try {
        // Read all files from the lightdash directory
        const files = await fs.readdir(inputDir);
        const jsonFiles = files.filter((file) => file.endsWith('.yml'));

        // Load each JSON file
        for (const file of jsonFiles) {
            const filePath = path.join(inputDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const chart = yaml.load(fileContent) as ChartAsCode;
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

    let created = 0;
    let updated = 0;
    try {
        for (const chart of charts) {
            GlobalState.debug(`Upserting chart ${chart.slug}`);
            const chartData = await lightdashApi<
                ApiChartAsCodeUpsertResponse['results']
            >({
                method: 'POST',
                url: `/api/v1/projects/${projectId}/charts/${chart.slug}/code`,
                body: JSON.stringify(chart),
            });
            if (chartData.created) {
                created += 1;
                GlobalState.debug(`Created chart: ${chart.name}`);
            } else {
                updated += 1;
                GlobalState.debug(`Updated chart: ${chart.name}`);
            }
        }
    } catch (error) {
        console.error('Error upserting chart', error);
    }
    console.info(`Total charts created: ${created} `);
    console.info(`Total charts updated: ${updated} `);
};
