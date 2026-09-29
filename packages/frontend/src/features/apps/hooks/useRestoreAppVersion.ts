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
import {
    appApiBase,
    appQueryKey,
    vizSchemaQueryKey,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type RestoreAppVersionParams = {
    projectUuid: string;
    appUuid: string;
    version: number;
    owner: ChartTypeOwner;
};

type RestoreAppVersionResult = ApiRestoreAppVersionResponse['results'];

const restoreAppVersion = ({
    projectUuid,
    appUuid,
    version,
    owner,
}: RestoreAppVersionParams) =>
    lightdashApi<RestoreAppVersionResult>({
        method: 'POST',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}/versions/${version}/restore`,
        body: undefined,
    });

/** The app or its versions changed server-side; the viz contract may have too. */
export const invalidateAppQueries = (
    queryClient: QueryClient,
    projectUuid: string,
    appUuid: string,
    owner: ChartTypeOwner,
) =>
    Promise.all([
        queryClient.invalidateQueries({
            queryKey: appQueryKey(owner, projectUuid, appUuid),
        }),
        queryClient.invalidateQueries({
            queryKey: vizSchemaQueryKey(owner, projectUuid, appUuid),
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
        onSuccess: (_data, { projectUuid, appUuid, owner }) => {
            void invalidateAppQueries(queryClient, projectUuid, appUuid, owner);
        },
    });
};
