import {
    type ApiError,
    type ApiRestoreAppVersionResponse,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type RestoreAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
};

type RestoreAppVersionResult = ApiRestoreAppVersionResponse['results'];

const restoreAppVersion = ({
    projectUuid,
    appUuid,
    version,
}: RestoreAppVersionParams) =>
    lightdashApi<RestoreAppVersionResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/restore`,
        body: undefined,
    });

/** The app gained a ready version; its viz contract may have changed too. */
export const invalidateAppAfterRestore = (
    queryClient: QueryClient,
    projectUuid: string,
    appUuid: string,
) =>
    Promise.all([
        queryClient.invalidateQueries({
            queryKey: ['app', projectUuid, appUuid],
        }),
        queryClient.invalidateQueries({
            queryKey: ['data-app-viz', projectUuid, appUuid],
        }),
    ]);

export const useRestoreAppVersion = () => {
    const queryClient = useQueryClient();
    return useMutation<
        RestoreAppVersionResult,
        ApiError,
        RestoreAppVersionParams
    >({
        mutationFn: restoreAppVersion,
        onSuccess: (_data, { projectUuid, appUuid }) => {
            void invalidateAppAfterRestore(queryClient, projectUuid, appUuid);
        },
    });
};
