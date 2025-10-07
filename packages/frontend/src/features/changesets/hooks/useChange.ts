import { type ApiError, type ApiGetChangeResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getChange = async (projectUuid: string, changeUuid: string) =>
    lightdashApi<ApiGetChangeResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/changesets/changes/${changeUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useChange = (
    projectUuid: string,
    changeUuid: string | undefined,
) =>
    useQuery<ApiGetChangeResponse['results'], ApiError>({
        queryKey: ['change', projectUuid, changeUuid],
        queryFn: () => getChange(projectUuid, changeUuid!),
        enabled: !!projectUuid && !!changeUuid,
        retry: (failureCount, error) => {
            // Don't retry if change was deleted
            if (error.error?.statusCode === 404) {
                return false;
            }
            return failureCount < 3;
        },
    });
