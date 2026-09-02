import {
    type ApiError,
    type ApiListRegistryChartTypesResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getRegistryChartTypes = async (projectUuid: string) =>
    lightdashApi<ApiListRegistryChartTypesResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/registry/charts`,
        body: undefined,
    });

// Installable chart types from the configured chart registry, merged with
// this project's install state. Only fetched once the registry feature flag
// resolves enabled, so `enabled` gates the query rather than the caller
// conditionally invoking the hook.
export const useRegistryChartTypes = (
    projectUuid: string | undefined,
    enabled: boolean,
) =>
    useQuery<ApiListRegistryChartTypesResponse['results'], ApiError>({
        queryKey: ['registry-chart-types', projectUuid],
        queryFn: () => getRegistryChartTypes(projectUuid!),
        enabled: !!projectUuid && enabled,
        staleTime: 5 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
    });
