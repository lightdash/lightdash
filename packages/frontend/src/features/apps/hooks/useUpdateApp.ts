import {
    type ApiError,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';

type UpdateAppParams = {
    projectUuid: string;
    appUuid: string;
} & ApiUpdateAppRequest;

type UpdateAppResult = ApiUpdateAppResponse['results'];

const updateApp = async ({
    projectUuid,
    appUuid,
    ...body
}: UpdateAppParams): Promise<UpdateAppResult> => {
    const data = await lightdashApi<UpdateAppResult>({
        method: 'PATCH',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}`,
        body: JSON.stringify(body),
    });
    return data;
};

export const useUpdateApp = (options?: { resourceLabel?: string }) => {
    const resourceLabel = options?.resourceLabel ?? 'App';
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<UpdateAppResult, ApiError, UpdateAppParams>({
        mutationFn: updateApp,
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, variables.appUuid],
            });
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            // Chart types are apps too; refresh the viz queries their picker,
            // header and builder read from (icon and name/description edits).
            void queryClient.invalidateQueries({
                queryKey: [
                    'data-app-viz',
                    variables.projectUuid,
                    variables.appUuid,
                ],
            });
            void queryClient.invalidateQueries({
                queryKey: ['data-app-vizs'],
            });
            void invalidateContent(queryClient, variables.projectUuid);
            const field = variables.name
                ? 'name'
                : variables.description
                  ? 'description'
                  : 'metadata';
            showToastSuccess({
                title: `${resourceLabel} ${field} updated successfully`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to update ${resourceLabel.toLowerCase()}`,
                apiError: error,
            });
        },
    });
};
