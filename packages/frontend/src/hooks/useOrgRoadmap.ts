import type { ApiError, ApiRoadmapResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getOrgRoadmap = async () =>
    lightdashApi<ApiRoadmapResponse['results']>({
        url: '/org/roadmap',
        method: 'GET',
        body: undefined,
    });

export const useOrgRoadmap = (enabled: boolean) =>
    useQuery<ApiRoadmapResponse['results'], ApiError>({
        queryKey: ['org-roadmap'],
        queryFn: getOrgRoadmap,
        enabled,
        retry: false,
    });
