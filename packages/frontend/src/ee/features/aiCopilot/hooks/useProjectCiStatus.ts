import type { ApiError, ProjectCiStatus } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getProjectCiStatus = (
    projectUuid: string,
): Promise<ProjectCiStatus | null> =>
    lightdashApi<ProjectCiStatus | null>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/ci-status`,
        method: 'GET',
        body: undefined,
    });

/**
 * Whether a project's repo deploys Lightdash previews (the pipeline-detection
 * signal recorded by AI write-back). `null` results mean "never scanned".
 * CI status changes rarely, so this is cached and not polled.
 */
export const useProjectCiStatus = (projectUuid: string | undefined) =>
    useQuery<ProjectCiStatus | null, ApiError>({
        queryKey: ['projectCiStatus', projectUuid],
        queryFn: () => getProjectCiStatus(projectUuid!),
        enabled: !!projectUuid,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
