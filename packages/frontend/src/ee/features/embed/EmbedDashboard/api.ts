import type {
    ApiChartAndResults,
    ApiCsvUrlResponse,
    ApiDownloadCsv,
    ApiScheduledDownloadCsv,
    Dashboard,
    DashboardFilters,
    DateGranularity,
    InteractivityOptions,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (projectUuid: string, embedToken: string) => {
    return lightdashApi<Dashboard & InteractivityOptions>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: undefined,
    });
};

export const postEmbedChartAndResults = (
    projectUuid: string,
    embedToken: string,
    tileUuid: string,
    dashboardFilters: DashboardFilters,
    dateZoomGranularity: DateGranularity | undefined,
) => {
    return lightdashApi<ApiChartAndResults>({
        url: `/embed/${projectUuid}/chart-and-results`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: JSON.stringify({
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
        }),
    });
};

export const downloadCsvFromSavedChart = async ({
    embedToken,
    projectUuid,
    chartUuid,
    dashboardFilters,
    tileUuid,
    csvLimit,
    onlyRaw,
}: {
    embedToken: string;
    projectUuid: string;
    chartUuid: string;
    dashboardFilters?: DashboardFilters;
    tileUuid?: string;
    // Csv properties
    onlyRaw: boolean;
    csvLimit: number | null | undefined;
}) => {
    return lightdashApi<ApiScheduledDownloadCsv>({
        url: `/embed/${projectUuid}/chart/${chartUuid}/downloadCsv`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: JSON.stringify({
            dashboardFilters,
            tileUuid,
            csvLimit,
            onlyRaw,
        }),
    });
};

const getEmbedCsvFileUrl = async ({
    embedToken,
    projectUuid,
    jobId,
}: ApiScheduledDownloadCsv & { embedToken: string; projectUuid: string }) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/embed/${projectUuid}/csv/${jobId}`,
        method: 'GET',
        body: undefined,
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
    });

export const pollEmbedCsvFileUrl = async ({
    embedToken,
    projectUuid,
    jobId,
}: ApiScheduledDownloadCsv & { embedToken: string; projectUuid: string }) =>
    new Promise<ApiCsvUrlResponse['results']>((resolve, reject) => {
        const poll = () => {
            getEmbedCsvFileUrl({ embedToken, projectUuid, jobId })
                .then((data) => {
                    if (data.url) {
                        resolve(data);
                    } else {
                        setTimeout(poll, 2000);
                    }
                })
                .catch((error) => {
                    reject(error);
                });
        };

        poll();
    });
