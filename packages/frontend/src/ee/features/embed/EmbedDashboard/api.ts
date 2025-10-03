import type {
    ApiJobScheduledResponse,
    Dashboard,
    DownloadOptions,
    InteractivityOptions,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (projectUuid: string) => {
    return lightdashApi<Dashboard & InteractivityOptions>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        body: undefined,
    });
};

export const scheduleEmbedDownloadQuery = async (
    projectUuid: string,
    queryUuid: string,
    options: DownloadOptions = {},
) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/embed/${projectUuid}/${queryUuid}/schedule-download`,
        method: 'POST',
        body: JSON.stringify({
            type: options.fileType,
            onlyRaw: options.onlyRaw,
            showTableNames: options.showTableNames,
            customLabels: options.customLabels,
            columnOrder: options.columnOrder,
            hiddenFields: options.hiddenFields,
            pivotConfig: options.pivotConfig,
            attachmentDownloadName: options.attachmentDownloadName,
        }),
    });
};
