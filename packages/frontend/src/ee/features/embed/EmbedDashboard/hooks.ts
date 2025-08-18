import type {
    ApiError,
    Dashboard,
    InteractivityOptions,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { postEmbedDashboard } from './api';

export const useEmbedDashboard = (projectUuid: string | undefined) => {
    return useQuery<Dashboard & InteractivityOptions, ApiError>({
        queryKey: ['embed-dashboard'],
        queryFn: () => postEmbedDashboard(projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });
};
