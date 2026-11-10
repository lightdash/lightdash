import {
    type ApiDownloadCsv,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { type LightdashApi } from '../api';

export const getCsvFileUrl = async (
    lightdashApi: LightdashApi,
    { jobId }: ApiScheduledDownloadCsv,
) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/csv/${jobId}`,
        method: 'GET',
        body: undefined,
    });
