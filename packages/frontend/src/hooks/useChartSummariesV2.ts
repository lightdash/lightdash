import {
    ContentType,
    type ApiChartContentResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getChartSummariesInProjectV2 = async (projectUuid: string) => {
    return lightdashApi<ApiChartContentResponse['results']>({
        version: 'v2',
        url: `/content?projectUuids=${projectUuid}&contentTypes=${ContentType.CHART}&pageSize=${Number.MAX_SAFE_INTEGER}`, // TODO: remove pageSize max once we have pagination
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummariesV2 = (projectUuid: string) => {
    return useQuery<
        ApiChartContentResponse['results'],
        ApiError,
        ApiChartContentResponse['results']['data']
    >({
        queryKey: ['project', projectUuid, 'chart-summaries-v2'],
        queryFn: () => getChartSummariesInProjectV2(projectUuid),
        select(data) {
            return data.data;
        },
    });
};
