import type { ApiError, EmbedDashboard } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { postEmbedDashboard } from './api';

export const useEmbedDashboard = (
    projectUuid: string | undefined,
    paletteUuid?: string,
) => {
    return useQuery<EmbedDashboard, ApiError>({
        queryKey: ['embed-dashboard', projectUuid, paletteUuid],
        queryFn: () => postEmbedDashboard(projectUuid!, { paletteUuid }),
        enabled: !!projectUuid,
        retry: false,
    });
};
