import type {
    EmbedDashboard,
    GetEmbedDashboardRequest,
} from '@lightdash/common';
import { type LightdashApi } from '../../../../api';

export const postEmbedDashboard = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body?: GetEmbedDashboardRequest,
) => {
    return lightdashApi<EmbedDashboard>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        body: JSON.stringify(body ?? {}),
    });
};
