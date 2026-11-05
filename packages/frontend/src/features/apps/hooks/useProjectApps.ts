import { type ApiError, type EmbedProjectApp } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export type ProjectAppKind = 'data_app' | 'project_chart_type';

const getProjectApps = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    kind: ProjectAppKind,
): Promise<EmbedProjectApp[]> =>
    lightdashApi<EmbedProjectApp[]>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps${
            kind === 'project_chart_type' ? '/chart-types' : ''
        }`,
        body: undefined,
    });

export const useProjectAppsByKind = (
    projectUuid: string | undefined,
    kind: ProjectAppKind,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<EmbedProjectApp[], ApiError>({
        queryKey: [
            kind === 'data_app' ? 'project-apps' : 'project-chart-types',
            projectUuid,
        ],
        queryFn: () => getProjectApps(lightdashApi, projectUuid!, kind),
        enabled: !!projectUuid,
    });
};

/**
 * Lists the project's (non-deleted) data apps — used to populate the embed
 * config's standalone-app allowlist picker.
 */
export const useProjectApps = (projectUuid: string | undefined) =>
    useProjectAppsByKind(projectUuid, 'data_app');
