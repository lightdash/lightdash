import {
    type ApiError,
    type ApiPullRequestsResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { type PullRequestAuthor, type PullRequestRow } from '../types';

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
 * Shared data hook for every Pull Requests table version. Fetches the paginated
 * pull requests for the current page and resolves each author from the org
 * members list. Returns render-ready rows plus pagination metadata.
 */
export const usePullRequestsTable = (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
) => {
    const pullRequestsQuery = useQuery<
        ApiPullRequestsResponse['results'],
        ApiError
    >({
        queryKey: [
            'pull-requests',
            projectUuid,
            paginateArgs.page,
            paginateArgs.pageSize,
        ],
        queryFn: () => getPullRequests(projectUuid, paginateArgs),
        keepPreviousData: true,
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
            (pullRequestsQuery.data?.data ?? []).map((pullRequest) => ({
                ...pullRequest,
                author: pullRequest.createdByUserUuid
                    ? (authorsByUuid.get(pullRequest.createdByUserUuid) ?? null)
                    : null,
            })),
        [pullRequestsQuery.data, authorsByUuid],
    );

    return {
        rows,
        pagination: pullRequestsQuery.data?.pagination,
        isLoading: pullRequestsQuery.isInitialLoading,
        isFetching: pullRequestsQuery.isFetching,
        error: pullRequestsQuery.error,
    };
};
