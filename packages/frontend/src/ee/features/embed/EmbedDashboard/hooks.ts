import type { ApiError, EmbedDashboard } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { postEmbedDashboard } from './api';

export const useEmbedDashboard = (
    projectUuid: string | undefined,
    paletteUuid?: string,
    enabled: boolean = true,
) => {
    return useQuery<EmbedDashboard, ApiError>({
        queryKey: ['embed-dashboard', projectUuid, paletteUuid],
        queryFn: () => postEmbedDashboard(projectUuid!, { paletteUuid }),
        enabled: !!projectUuid && enabled,
        // Inherits the app-wide retry policy: transient NetworkErrors retry
        // with backoff; real API errors (e.g. expired JWT) surface at once.
    });
};
