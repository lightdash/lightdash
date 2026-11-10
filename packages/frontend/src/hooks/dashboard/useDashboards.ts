import {
    type ApiError,
    type DashboardBasicDetailsWithTileTypes,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useQueryError from '../useQueryError';

const getDashboards = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    includePrivateSpaces: boolean,
) =>
    lightdashApi<DashboardBasicDetailsWithTileTypes[]>({
        url: `/projects/${projectUuid}/dashboards?includePrivate=${includePrivateSpaces}`,
        method: 'GET',
        body: undefined,
    });

const getDashboardsContainingChart = async (
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();

    return useQuery<DashboardBasicDetailsWithTileTypes[], ApiError>(
        ['dashboards', projectUuid, includePrivateSpaces],
        () => getDashboards(lightdashApi, projectUuid!, includePrivateSpaces),
        {
            ...useQueryOptions,
            onError: (result) => {
                setErrorResponse(result);
                useQueryOptions?.onError?.(result);
            },
            enabled: !!projectUuid && (useQueryOptions?.enabled ?? true),
        },
    );
};

export const useDashboardsContainingChart = (
    projectUuid?: string,
    chartId?: string,
    includePrivate = true,
) => {
    const lightdashApi = useLightdashApi();
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
                lightdashApi,
                projectUuid!,
                chartId!,
                includePrivate,
            ),
        onError: (result) => setErrorResponse(result),
        enabled: !!projectUuid && !!chartId,
    });
};
