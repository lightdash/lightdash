import {
    type ApiError,
    type ApiRestoreAppVersionResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

export const useRestoreAppVersion = () => {
    const queryClient = useQueryClient();
    return useMutation<
        RestoreAppVersionResult,
        ApiError,
        RestoreAppVersionParams
    >({
        mutationFn: restoreAppVersion,
        onSuccess: (_data, variables) => {
            // Pull the new ready version into the timeline so AppGenerate
            // auto-pins onto it.
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, variables.appUuid],
            });
            // The restored version carries its own field schema, so any panel
            // open over this visualization is now reconciling against a
            // contract that is no longer the one being rendered.
            void queryClient.invalidateQueries({
                queryKey: [
                    'data-app-viz',
                    variables.projectUuid,
                    variables.appUuid,
                ],
            });
        },
    });
};
