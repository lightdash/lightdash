import {
    type ApiDownloadCsv,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';

import { lightdashApi } from '../api';

export const getCsvFileUrl = async ({ jobId }: ApiScheduledDownloadCsv) =>
    lightdashApi<ApiDownloadCsv>({
        url: `/csv/${jobId}`,
        method: 'GET',
        body: undefined,
    });
