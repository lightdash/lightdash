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
    return { ...spaces, data: spaces.data?.[0]?.queries };
};

const getSpace = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useSpace = (projectUuid: string, spaceUuid: string) =>
    useQuery<Space, ApiError>({
        queryKey: ['spaces', projectUuid],
        queryFn: () => getSpace(projectUuid, spaceUuid),
    });
