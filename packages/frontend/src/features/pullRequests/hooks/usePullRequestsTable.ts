import {
    type ApiError,
    type ApiPullRequestsResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { type PullRequestAuthor, type PullRequestRow } from '../types';
import { DEFAULT_PULL_REQUESTS_PAGE_SIZE } from '../utils';

const getPullRequests = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
): Promise<ApiPullRequestsResponse['results']> =>
    lightdashApi<ApiPullRequestsResponse['results']>({
        url: `/projects/${projectUuid}/pull-requests?page=${paginateArgs.page}&pageSize=${paginateArgs.pageSize}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Infinite-scroll data hook for the Pull Requests table. Fetches pages, flattens
 * them into render-ready rows, and resolves each author from the org members
 * list. Returns the rows plus the controls the page needs to fetch more on
 * scroll.
 */
export const usePullRequestsTable = (projectUuid: string) => {
    const query = useInfiniteQuery<
        ApiPullRequestsResponse['results'],
        ApiError
    >({
        queryKey: ['pull-requests', projectUuid],
        queryFn: ({ pageParam = 1 }) =>
            getPullRequests(projectUuid, {
                page: pageParam as number,
                pageSize: DEFAULT_PULL_REQUESTS_PAGE_SIZE,
            }),
        getNextPageParam: (lastPage, pages) => {
            const currentPage = pages.length;
            const totalPages = lastPage.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });

    const usersQuery = useOrganizationUsers();

    const authorsByUuid = useMemo(() => {
        const map = new Map<string, PullRequestAuthor>();
        (usersQuery.data ?? []).forEach((member) => {
            map.set(member.userUuid, {
                userUuid: member.userUuid,
                name:
                    `${member.firstName ?? ''} ${
                        member.lastName ?? ''
                    }`.trim() || member.email,
                email: member.email,
            });
        });
        return map;
    }, [usersQuery.data]);

    const rows = useMemo<PullRequestRow[]>(
        () =>
            (query.data?.pages ?? [])
                .flatMap((page) => page.data)
                .map((pullRequest) => ({
                    ...pullRequest,
                    author: pullRequest.createdByUserUuid
                        ? (authorsByUuid.get(pullRequest.createdByUserUuid) ??
                          null)
                        : null,
                })),
        [query.data, authorsByUuid],
    );

    const totalResults =
        query.data?.pages?.[0]?.pagination?.totalResults ?? rows.length;

    return {
        rows,
        totalResults,
        isLoading: query.isInitialLoading,
        isFetchingNextPage: query.isFetchingNextPage,
        hasNextPage: query.hasNextPage ?? false,
        fetchNextPage: query.fetchNextPage,
        error: query.error,
    };
};
