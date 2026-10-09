import {
    type ApiError,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type UpdateAppParams = {
    projectUuid: string;
    appUuid: string;
} & ApiUpdateAppRequest;

type UpdateAppResult = ApiUpdateAppResponse['results'];

const updateApp = async (
    lightdashApi: LightdashApi,
    { projectUuid, appUuid, ...body }: UpdateAppParams,
): Promise<UpdateAppResult> => {
    const data = await lightdashApi<UpdateAppResult>({
        method: 'PATCH',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}`,
        body: JSON.stringify(body),
    });
    return data;
};

export const useUpdateApp = (options?: {
    resourceLabel?: string;
    appUuidOrSlug?: string;
}) => {
    const lightdashApi = useLightdashApi();
    const resourceLabel = options?.resourceLabel ?? 'App';
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<UpdateAppResult, ApiError, UpdateAppParams>({
        mutationFn: (args: UpdateAppParams) => updateApp(lightdashApi, args),
        onSuccess: (_data, variables) => {
            const identifiers = new Set(
                [variables.appUuid, options?.appUuidOrSlug].filter(
                    (identifier): identifier is string => Boolean(identifier),
                ),
            );

            identifiers.forEach((identifier) => {
                void queryClient.invalidateQueries({
                    queryKey: ['app', variables.projectUuid, identifier],
                });
                // Chart types are apps too; refresh the viz detail read by
                // their picker, header and builder.
                void queryClient.invalidateQueries({
                    queryKey: [
                        'data-app-viz',
                        variables.projectUuid,
                        identifier,
                    ],
                });
            });
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
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
