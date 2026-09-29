import {
    type ApiError,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import {
    appApiBase,
    appQueryKey,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type UpdateAppParams = {
    projectUuid: string;
    appUuid: string;
    owner: ChartTypeOwner;
} & ApiUpdateAppRequest;

type UpdateAppResult = ApiUpdateAppResponse['results'];

const updateApp = async ({
    projectUuid,
    appUuid,
    owner,
    ...body
}: UpdateAppParams): Promise<UpdateAppResult> => {
    const data = await lightdashApi<UpdateAppResult>({
        method: 'PATCH',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}`,
        body: JSON.stringify(body),
    });
    return data;
};

export const useUpdateApp = (options?: {
    resourceLabel?: string;
    appUuidOrSlug?: string;
}) => {
    const resourceLabel = options?.resourceLabel ?? 'App';
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<UpdateAppResult, ApiError, UpdateAppParams>({
        mutationFn: updateApp,
        onSuccess: (_data, variables) => {
            const identifiers = new Set(
                [variables.appUuid, options?.appUuidOrSlug].filter(
                    (identifier): identifier is string => Boolean(identifier),
                ),
            );

            identifiers.forEach((identifier) => {
                void queryClient.invalidateQueries({
                    queryKey: appQueryKey(
                        variables.owner,
                        variables.projectUuid,
                        identifier,
                    ),
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
            if (variables.owner === 'organization') {
                void queryClient.invalidateQueries({
                    queryKey: ['organization-data-app-vizs'],
                });
            }
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
