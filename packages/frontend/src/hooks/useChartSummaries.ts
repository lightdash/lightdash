import { ApiError, ChartSummary } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getChartSummariesInProject = async (projectUuid: string) => {
    return lightdashApi<ChartSummary[]>({
        url: `/projects/${projectUuid}/charts`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummaries = (projectUuid: string) => {
    return useQuery<ChartSummary[], ApiError>(
        ['project', projectUuid, 'charts'],
        () => getChartSummariesInProject(projectUuid),
    );
};
