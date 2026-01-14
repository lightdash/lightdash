import {
    type ApiError,
    type DashboardBasicDetailsWithTileTypes,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useQueryError from '../useQueryError';

const getDashboards = async (
    projectUuid: string,
    includePrivateSpaces: boolean,
) =>
    lightdashApi<DashboardBasicDetailsWithTileTypes[]>({
        url: `/projects/${projectUuid}/dashboards?includePrivate=${includePrivateSpaces}`,
        method: 'GET',
        body: undefined,
    });

const getDashboardsContainingChart = async (
    projectUuid: string,
    chartId: string,
    includePrivate: boolean,
) =>
    lightdashApi<DashboardBasicDetailsWithTileTypes[]>({
        url: `/projects/${projectUuid}/dashboards?chartUuid=${chartId}&includePrivate=${includePrivate}`,
        method: 'GET',
        body: undefined,
    });

export const useDashboards = (
    projectUuid?: string,
    useQueryOptions?: UseQueryOptions<
        DashboardBasicDetailsWithTileTypes[],
        ApiError
    >,
    includePrivateSpaces: boolean = false,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<DashboardBasicDetailsWithTileTypes[], ApiError>(
        ['dashboards', projectUuid, includePrivateSpaces],
        () => getDashboards(projectUuid!, includePrivateSpaces),
        {
            ...useQueryOptions,
            onError: (result) => {
                setErrorResponse(result);
                useQueryOptions?.onError?.(result);
            },
            enabled: !!projectUuid,
        },
    );
};

export const useDashboardsContainingChart = (
    projectUuid?: string,
    chartId?: string,
    includePrivate = true,
) => {
    const setErrorResponse = useQueryError();
    return useQuery<DashboardBasicDetailsWithTileTypes[], ApiError>({
        queryKey: [
            'dashboards-containing-chart',
            projectUuid,
            chartId,
            includePrivate,
        ],
        queryFn: () =>
            getDashboardsContainingChart(
                projectUuid!,
                chartId!,
                includePrivate,
            ),
        onError: (result) => setErrorResponse(result),
        enabled: !!projectUuid && !!chartId,
    });
};
