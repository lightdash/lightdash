import { subject } from '@casl/ability';
import {
    type ApiError,
    type ContentAsCodeReleasableType,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useCanManageContentAsCode = (projectUuid: string | undefined) => {
    const ability = useAbilityContext();
    const { data: project } = useProject(projectUuid);
    return (
        !!project &&
        ability.can('manage', subject('ContentAsCode', { ...project }))
    );
};

export const useReleaseContentAsCodeSnapshot = (
    projectUuid: string | undefined,
    contentType: ContentAsCodeReleasableType,
    slug: string,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError>(
        () =>
            lightdashApi<undefined>({
                url: `/projects/${projectUuid}/code/snapshots/${contentType}/${slug}`,
                method: 'DELETE',
                body: undefined,
            }),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    contentType === 'chart'
                        ? 'saved_query'
                        : 'saved_dashboard_query',
                ]);
                showToastSuccess({
                    title: 'No longer managed from the repository',
                    subtitle: 'Saves in the app publish directly again.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Could not release this content',
                    apiError: error,
                });
            },
        },
    );
};
