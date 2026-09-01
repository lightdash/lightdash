import { type ApiError, type EmbedProjectApp } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type ProjectAppKind = 'data_app' | 'project_chart_type';

const getProjectApps = async (
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
) =>
    useQuery<EmbedProjectApp[], ApiError>({
        queryKey: [
            kind === 'data_app' ? 'project-apps' : 'project-chart-types',
            projectUuid,
        ],
        queryFn: () => getProjectApps(projectUuid!, kind),
        enabled: !!projectUuid,
    });

/**
 * Lists the project's (non-deleted) data apps — used to populate the embed
 * config's standalone-app allowlist picker.
 */
export const useProjectApps = (projectUuid: string | undefined) =>
    useProjectAppsByKind(projectUuid, 'data_app');
