import { type ApiChartAsCodeListResponse } from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { useContentAsCode } from './useContentAsCode';

const CHART_FIELDS_TO_OMIT = ['updatedAt', 'downloadedAt'];

const selectChart = (results: ApiChartAsCodeListResponse['results']) =>
    results.charts[0];

export const useChartAsCode = ({
    projectUuid,
    chartUuid,
    enabled,
}: {
    projectUuid: string;
    chartUuid: string;
    enabled: boolean;
}) => {
    return useContentAsCode<ApiChartAsCodeListResponse['results']>({
        queryKey: ['chart-as-code', projectUuid, chartUuid],
        queryFn: () =>
            lightdashApi<ApiChartAsCodeListResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/charts?${new URLSearchParams(
                    [['ids', chartUuid]],
                ).toString()}`,
                body: undefined,
            }),
        selectDocument: selectChart,
        enabled,
        fieldsToOmit: CHART_FIELDS_TO_OMIT,
    });
};
