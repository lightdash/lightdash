import { type ApiError, type UpdateMetadata } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const updateProject = async (id: string, data: UpdateMetadata) =>
    lightdashApi<null>({
        url: `/projects/${id}/metadata`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateMutation = (id: string) => {
    const { t } = useTranslation('app');
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateMetadata>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', id]);
                showToastSuccess({
                    title: t('dataOps.toast.updated'),
                    subtitle: t('dataOps.toast.updatedSubtitle'),
                });
            },
            onError: (error) => {
                showToastError({
                    title: t('dataOps.toast.updateFailed'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};
