import { type ApiError, type EmbedProjectApp } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getProjectApps = async (
    projectUuid: string,
): Promise<EmbedProjectApp[]> =>
    lightdashApi<EmbedProjectApp[]>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps`,
        body: undefined,
    });

/**
 * Lists the project's (non-deleted) data apps — used to populate the embed
 * config's standalone-app allowlist picker.
 */
export const useProjectApps = (projectUuid: string | undefined) =>
    useQuery<EmbedProjectApp[], ApiError>({
        queryKey: ['project-apps', projectUuid],
        queryFn: () => getProjectApps(projectUuid!),
        enabled: !!projectUuid,
    });
