import {
    type ApiError,
    type ApiSpaceAccessListResponse,
    type SpaceShare,
} from '@lightdash/common';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

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
    lightdashApi: LightdashApi,
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<SpaceAccessPage, ApiError>({
        queryKey: getSpaceAccessQueryKey(projectUuid, spaceUuid, params),
        queryFn: () =>
            getSpaceAccess(lightdashApi, projectUuid!, spaceUuid!, params),
        enabled: !!projectUuid && !!spaceUuid && (options?.enabled ?? true),
        keepPreviousData: true,
    });
};

export const useSpaceAccessByUserUuids = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
    userUuids: string[],
): {
    map: Map<string, SpaceShare>;
    isLoading: boolean;
    isError: boolean;
} => {
    const lightdashApi = useLightdashApi();
    const userUuidChunks = useMemo(
        () =>
            [...new Set(userUuids)].reduce<string[][]>((chunks, userUuid) => {
                const lastChunk = chunks[chunks.length - 1];
                if (!lastChunk || lastChunk.length === 50) {
                    chunks.push([userUuid]);
                } else {
                    lastChunk.push(userUuid);
                }
                return chunks;
            }, []),
        [userUuids],
    );

    const queries = useQueries({
        queries: userUuidChunks.map((userUuidChunk) => {
            const sortedUserUuidChunk = [...userUuidChunk].sort();
            return {
                queryKey: [
                    SPACE_ACCESS_QUERY_KEY,
                    projectUuid,
                    spaceUuid,
                    'users',
                    sortedUserUuidChunk,
                ],
                queryFn: () =>
                    getSpaceAccess(lightdashApi, projectUuid!, spaceUuid!, {
                        userUuids: sortedUserUuidChunk,
                    }),
                enabled: !!projectUuid && !!spaceUuid,
            };
        }),
    });

    const map = useMemo(
        () =>
            new Map(
                queries.flatMap(({ data }) =>
                    (data?.data ?? []).map((share): [string, SpaceShare] => [
                        share.userUuid,
                        share,
                    ]),
                ),
            ),
        [queries],
    );

    return {
        map,
        isLoading: queries.some(({ isLoading }) => isLoading),
        isError: queries.some(({ isError }) => isError),
    };
};

export const useSearchSpaceAccess = (
    projectUuid: string | undefined,
    spaceUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
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
                queryFn: () =>
                    getSpaceAccess(
                        lightdashApi,
                        projectUuid,
                        spaceUuid,
                        params,
                    ),
            });

            return page.data;
        },
        [queryClient, projectUuid, spaceUuid, lightdashApi],
    );
};
