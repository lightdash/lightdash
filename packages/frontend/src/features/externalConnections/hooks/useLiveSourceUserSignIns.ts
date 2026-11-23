import { type ApiError, type LiveSourceUserSignIn } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/**
 * The project's live sources that query with each viewer's own sign-in, and
 * whether you have signed in to each. Any project viewer may read it.
 */
export const useLiveSourceUserSignIns = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<LiveSourceUserSignIn[], ApiError>({
        queryKey: ['live-source-user-sign-ins', projectUuid],
        queryFn: () =>
            lightdashApi<LiveSourceUserSignIn[]>({
                url: `/ee/projects/${projectUuid}/live-sources/user-sign-ins`,
                method: 'GET',
                body: undefined,
            }),
        enabled: !!projectUuid,
    });
};
