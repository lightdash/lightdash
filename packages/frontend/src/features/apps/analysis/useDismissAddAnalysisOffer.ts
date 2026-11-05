import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type DismissParams = {
    projectUuid: string;
    appUuid: string;
};

const dismissAddAnalysisOffer = async (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid }: DismissParams,
): Promise<undefined> =>
    lightdashApi<undefined>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/analysis-offer/dismiss`,
        body: undefined,
    });

/**
 * Persist the dismissal of the builder-side "add AI analysis" offer on the
 * app itself, so it stays dismissed across browsers and builders. Silent on
 * error: the caller hides the offer locally for the session either way.
 */
export const useDismissAddAnalysisOffer = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, DismissParams>({
        mutationFn: (args) => dismissAddAnalysisOffer(lightdashApi, args),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, variables.appUuid],
            });
        },
    });
};
