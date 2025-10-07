import { type ApiChangesetsResponse, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getActiveChangesets = async (projectUuid: string) =>
    lightdashApi<ApiChangesetsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/changesets`,
        method: 'GET',
        body: undefined,
    });

export const useActiveChangesets = (projectUuid: string) =>
    useQuery<ApiChangesetsResponse['results'], ApiError>({
        queryKey: ['activeChangesets', projectUuid],
        queryFn: () => getActiveChangesets(projectUuid),
        enabled: !!projectUuid,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
    });
