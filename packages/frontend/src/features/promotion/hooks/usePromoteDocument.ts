import {
    getDocumentUrl,
    type ApiError,
    type Document,
    type PromotionChanges,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const usePromoteDocumentDiffMutation = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastError } = useToaster();
    return useMutation<PromotionChanges, ApiError, string>(
        (documentUuid) =>
            lightdashApi<PromotionChanges>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/promoteDiff`,
                method: 'GET',
                body: undefined,
            }),
        {
            mutationKey: ['promote_document_diff'],
            onError: (error) => {
                showToastError({
                    title: 'Failed to get diff from document',
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const usePromoteDocumentMutation = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<Document, ApiError, string>(
        (documentUuid) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/promote`,
                method: 'POST',
                body: undefined,
            }),
        {
            mutationKey: ['promote_document'],
            onSuccess: (document) => {
                showToastSuccess({
                    title: 'Success! Document was promoted.',
                    action: {
                        children: 'Open document',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                getDocumentUrl(
                                    document.projectUuid,
                                    document.documentUuid,
                                    document.slug,
                                ),
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to promote document',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
