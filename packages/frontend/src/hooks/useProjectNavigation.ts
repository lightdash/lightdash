import { type ApiError, type ProjectNavigation } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

export const PROJECT_NAVIGATION_QUERY_KEY = 'project-navigation';

const getProjectNavigation = (projectUuid: string) =>
    lightdashApi<ProjectNavigation>({
        url: `/projects/${projectUuid}/navigation`,
        method: 'GET',
        body: undefined,
    });

export const useProjectNavigation = (projectUuid: string | undefined) =>
    useQuery<ProjectNavigation, ApiError>({
        queryKey: [PROJECT_NAVIGATION_QUERY_KEY, projectUuid],
        queryFn: () => getProjectNavigation(projectUuid!),
        enabled: !!projectUuid,
    });
