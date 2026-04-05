import type {
    EmbedDashboard,
    GetEmbedDashboardRequest,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (
    projectUuid: string,
    body?: GetEmbedDashboardRequest,
) => {
    return lightdashApi<EmbedDashboard>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        body: JSON.stringify(body ?? {}),
    });
};
