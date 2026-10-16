import {
    getDocumentUrl,
    type ApiError,
    type Document,
    type PromotionChanges,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

export const usePromoteDocumentDiffMutation = (projectUuid: string) => {
    const { t } = useTranslation('app');
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
                    title: t('usePromoteDocument.failedToGetDiffFromDocument'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const usePromoteDocumentMutation = (projectUuid: string) => {
    const { t } = useTranslation('app');
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
                    title: t('usePromoteDocument.successDocumentWasPromoted'),
                    action: {
                        children: t('usePromoteDocument.openDocument'),
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
                    title: t('usePromoteDocument.failedToPromoteDocument'),
                    subtitle: error.error.message,
                });
            },
        },
    );
};
