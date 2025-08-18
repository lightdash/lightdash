import { type ApiGetProjectParametersListResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../api';

export interface UseProjectParametersListArgs {
    projectUuid: string;
    search?: string;
    sortBy?: 'name';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

const getProjectParametersList = async ({
    projectUuid,
    search,
    sortBy,
    sortOrder,
    page,
    pageSize,
}: UseProjectParametersListArgs): Promise<ApiGetProjectParametersListResults> => {
    const params = new URLSearchParams();

    if (search) params.append('search', search);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    if (page !== undefined) params.append('page', page.toString());
    if (pageSize !== undefined) params.append('pageSize', pageSize.toString());

    const queryString = params.toString();
    const url = `/projects/${projectUuid}/parameters/list${
        queryString ? `?${queryString}` : ''
    }`;

    return lightdashApi<ApiGetProjectParametersListResults>({
        url,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
};

export const useProjectParametersList = (
    args: UseProjectParametersListArgs,
) => {
    const queryKey = useMemo(
        () => [
            'projectParametersList',
            args.projectUuid,
            args.search,
            args.sortBy,
            args.sortOrder,
            args.page,
            args.pageSize,
        ],
        [
            args.projectUuid,
            args.search,
            args.sortBy,
            args.sortOrder,
            args.page,
            args.pageSize,
        ],
    );

    return useQuery({
        queryKey,
        queryFn: () => getProjectParametersList(args),
    });
};
