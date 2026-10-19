import {
    type ApiError,
    type ApiRestoreAppVersionResponse,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type RestoreAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
};

type RestoreAppVersionResult = ApiRestoreAppVersionResponse['results'];

const restoreAppVersion = (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid, version }: RestoreAppVersionParams,
) =>
    lightdashApi<RestoreAppVersionResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/restore`,
        body: undefined,
    });

/** The app or its versions changed server-side; the viz contract may have too. */
export const invalidateAppQueries = (
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        RestoreAppVersionResult,
        ApiError,
        RestoreAppVersionParams
    >({
        mutationFn: (args: RestoreAppVersionParams) =>
            restoreAppVersion(lightdashApi, args),
        onSuccess: (_data, { projectUuid, appUuid }) => {
            void invalidateAppQueries(queryClient, projectUuid, appUuid);
        },
    });
};
