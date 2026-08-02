import {
    ROADMAP_DEFAULT_PAGE_SIZE,
    type ApiError,
    type RoadmapQuery,
    type RoadmapResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const buildRoadmapUrl = (query: RoadmapQuery): string => {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
            searchParams.set(key, String(value));
        }
    });

    const queryString = searchParams.toString();
    return `/org/roadmap${queryString ? `?${queryString}` : ''}`;
};

const getOrgRoadmap = async (query: RoadmapQuery) =>
    lightdashApi<RoadmapResults>({
        url: buildRoadmapUrl(query),
        method: 'GET',
        body: undefined,
    });

const getAllOrgRoadmap = async (): Promise<RoadmapResults> => {
    const firstPage = await getOrgRoadmap({
        page: 1,
        pageSize: ROADMAP_DEFAULT_PAGE_SIZE,
    });
    const remainingPages = await Promise.all(
        Array.from(
            { length: Math.max(0, firstPage.pagination.totalPages - 1) },
            (_, index) =>
                getOrgRoadmap({
                    page: index + 2,
                    pageSize: ROADMAP_DEFAULT_PAGE_SIZE,
                }),
        ),
    );

    return {
        data: [
            ...firstPage.data,
            ...remainingPages.flatMap((page) => page.data),
        ],
        pagination: firstPage.pagination,
        facets: firstPage.facets,
    };
};

export const useAllOrgRoadmap = (enabled = true) =>
    useQuery<RoadmapResults, ApiError>({
        queryKey: ['org-roadmap-all'],
        queryFn: getAllOrgRoadmap,
        enabled,
        retry: false,
    });
