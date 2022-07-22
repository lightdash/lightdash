import { ApiError, Space } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getSpaces = async (projectUuid: string) =>
    lightdashApi<Space[]>({
        url: `/projects/${projectUuid}/spaces`,
        method: 'GET',
        body: undefined,
    });

export const useSpaces = (projectUuid: string) =>
    useQuery<Space[], ApiError>({
        queryKey: ['spaces', projectUuid],
        queryFn: () => getSpaces(projectUuid),
    });

export const useSavedCharts = (projectUuid: string) => {
    const spaces = useSpaces(projectUuid);
    const allCharts = spaces.data?.flatMap((space) => space.queries);
    return { ...spaces, data: allCharts };
};
