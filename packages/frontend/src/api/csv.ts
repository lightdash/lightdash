import {
    type ApiDownloadCsv,
    type ApiScheduledDownloadCsv,
    type ExportDashboardGsheetRequest,
} from '@lightdash/common';
import { lightdashApi } from '../api';

export const getCsvFileUrl = async ({ jobId }: ApiScheduledDownloadCsv) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/csv/${jobId}`,
        method: 'GET',
        body: undefined,
    });

export const exportDashboardToGsheet = async ({
    projectUuid,
    dashboardUuid,
    ...body
}: ExportDashboardGsheetRequest & {
    projectUuid: string;
    dashboardUuid: string;
}) =>
    lightdashApi<ApiScheduledDownloadCsv>({
        url: `/gdrive/export-dashboard/${projectUuid}/${dashboardUuid}`,
        method: 'POST',
        body: JSON.stringify(body),
    });
