import {
    type ApiError,
    type ApiSpaceAccessListResponse,
    type SpaceShare,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../api';

type SpaceAccessQueryParams = {
    page?: number;
    pageSize?: number;
    searchQuery?: string;
    userUuids?: string[];
    directOnly?: boolean;
};

export type SpaceAccessPage = ApiSpaceAccessListResponse['results'];

const SPACE_ACCESS_QUERY_KEY = 'space_access';

const MENTION_SUGGESTIONS_PAGE_SIZE = 20;

const getSpaceAccessQueryKey = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
    params: SpaceAccessQueryParams,
) => [
    SPACE_ACCESS_QUERY_KEY,
    projectUuid,
    spaceUuid,
    params.page ?? null,
    params.pageSize ?? null,
    params.searchQuery ?? '',
    params.userUuids ?? null,
    params.directOnly ?? false,
];

const getSpaceAccess = async (
    projectUuid: string,
    spaceUuid: string,
    params: SpaceAccessQueryParams,
) => {
    const urlParams = new URLSearchParams();
    if (params.page !== undefined) {
        urlParams.set('page', String(params.page));
    }
    if (params.pageSize !== undefined) {
        urlParams.set('pageSize', String(params.pageSize));
    }
    if (params.searchQuery) {
        urlParams.set('searchQuery', params.searchQuery);
    }
    if (params.directOnly) {
        urlParams.set('directOnly', 'true');
    }
    for (const userUuid of params.userUuids ?? []) {
        urlParams.append('userUuids', userUuid);
    }
    const queryString = urlParams.toString();

    return lightdashApi<SpaceAccessPage>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/access${
            queryString ? `?${queryString}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const useSpaceAccess = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
    params: {
        page: number;
        pageSize: number;
        searchQuery?: string;
        directOnly?: boolean;
    },
    options?: { enabled?: boolean },
) =>
    useQuery<SpaceAccessPage, ApiError>({
        queryKey: getSpaceAccessQueryKey(projectUuid, spaceUuid, params),
        queryFn: () => getSpaceAccess(projectUuid!, spaceUuid!, params),
        enabled: !!projectUuid && !!spaceUuid && (options?.enabled ?? true),
        keepPreviousData: true,
    });

export const useSpaceAccessByUserUuids = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
    userUuids: string[],
): Map<string, SpaceShare> => {
    const sortedUserUuids = useMemo(
        () => [...new Set(userUuids)].sort(),
        [userUuids],
    );

    const { data } = useQuery<SpaceAccessPage, ApiError>({
        queryKey: getSpaceAccessQueryKey(projectUuid, spaceUuid, {
            userUuids: sortedUserUuids,
        }),
        queryFn: () =>
            getSpaceAccess(projectUuid!, spaceUuid!, {
                userUuids: sortedUserUuids,
            }),
        enabled: !!projectUuid && !!spaceUuid && sortedUserUuids.length > 0,
        keepPreviousData: true,
    });

    return useMemo(
        () =>
            new Map((data?.data ?? []).map((share) => [share.userUuid, share])),
        [data],
    );
};

export const useSearchSpaceAccess = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
) => {
    const queryClient = useQueryClient();

    return useCallback(
        async (searchQuery: string): Promise<SpaceShare[]> => {
            if (!projectUuid || !spaceUuid) return [];

            const params: SpaceAccessQueryParams = {
                page: 1,
                pageSize: MENTION_SUGGESTIONS_PAGE_SIZE,
                searchQuery,
            };

            const page = await queryClient.fetchQuery<
                SpaceAccessPage,
                ApiError
            >({
                queryKey: getSpaceAccessQueryKey(
                    projectUuid,
                    spaceUuid,
                    params,
                ),
                queryFn: () => getSpaceAccess(projectUuid, spaceUuid, params),
            });

            return page.data;
        },
        [queryClient, projectUuid, spaceUuid],
    );
};
