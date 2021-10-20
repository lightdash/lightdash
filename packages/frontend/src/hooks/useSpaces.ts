import { ApiError, Space } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getSpaces = async (projectUuid: string) =>
    lightdashApi<Space[]>({
        url: `/projects/${projectUuid}/spaces`,
        method: 'GET',
        body: undefined,
    });

export const useSavedQuery = (projectUuid: string) =>
    useQuery<Space[], ApiError>({
        queryKey: ['spaces'],
        queryFn: () => getSpaces(projectUuid),
    });
