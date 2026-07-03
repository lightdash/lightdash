import type { ApiError, RoadmapItem } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getOrgRoadmap = async () =>
    lightdashApi<RoadmapItem[]>({
        url: '/org/roadmap',
        method: 'GET',
        body: undefined,
    });

export const useOrgRoadmap = (enabled: boolean) =>
    useQuery<RoadmapItem[], ApiError>({
        queryKey: ['org-roadmap'],
        queryFn: getOrgRoadmap,
        enabled,
        retry: false,
    });
