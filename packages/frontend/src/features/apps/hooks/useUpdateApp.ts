import {
    type ApiError,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

export const useUpdateApp = (options?: {
    resourceLabel?: string;
    appUuidOrSlug?: string;
}) => {
    const { t } = useTranslation('apps');
    const resourceLabel = options?.resourceLabel ?? t('toasts.defaultResource');
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
                title: t(`toasts.updated.${field}`, {
                    resource: resourceLabel,
                }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('toasts.updateFailed', {
                    resource: resourceLabel.toLowerCase(),
                }),
                apiError: error,
            });
        },
    });
};
