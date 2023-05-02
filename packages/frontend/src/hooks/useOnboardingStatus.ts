import { ApiError, ProjectSavedChartStatus } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';

const getProjectSavedChartStatus = async (projectUuid: string) =>
    lightdashApi<ProjectSavedChartStatus>({
        url: `/projects/${projectUuid}/hasSavedCharts`,
        method: 'GET',
        body: undefined,
    });

export const useProjectSavedChartStatus = (projectUuid: string) =>
    useQuery<ProjectSavedChartStatus, ApiError>({
        queryKey: [projectUuid, 'project-saved-chart-status'],
        queryFn: () => getProjectSavedChartStatus(projectUuid),
        retry: false,
        refetchOnMount: true,
    });
