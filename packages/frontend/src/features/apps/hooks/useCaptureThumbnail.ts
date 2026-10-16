import { isApiError } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import i18n from '../../../i18n/i18n';
import {
    refreshAppThumbnailQueries,
    useAppThumbnailUpload,
} from './useAppThumbnail';

type Args = {
    /** Null until the surface knows which app it is showing (no-op then).
     *  `version` is the one on screen; null = the latest ready version. */
    app: {
        projectUuid: string;
        appUuid: string;
        version: number | null;
    } | null;
    /** Raw capture of the surface's live preview iframe. */
    capture: () => Promise<File>;
};

const getErrorMessage = (err: unknown) =>
    isApiError(err)
        ? err.error.message
        : err instanceof Error
          ? err.message
          : i18n.t('common.unknownError', { ns: 'apps' });

/** Captures the live preview and saves it as the thumbnail of the version on screen. */
export const useCaptureThumbnail = ({ app, capture }: Args) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('apps');
    const { showToastSuccess, showToastError } = useToaster();
    const { mutateAsync: uploadThumbnail } = useAppThumbnailUpload();
    const [isCapturing, setIsCapturing] = useState(false);
    const projectUuid = app?.projectUuid ?? null;
    const appUuid = app?.appUuid ?? null;
    const version = app?.version ?? null;

    const captureThumbnail = useCallback(async () => {
        if (projectUuid === null || appUuid === null) return;
        setIsCapturing(true);
        try {
            const file = await capture();
            await uploadThumbnail({ projectUuid, appUuid, version, file });
            void refreshAppThumbnailQueries(queryClient, {
                projectUuid,
                appUuid,
                change: 'captured',
            });
            showToastSuccess({ title: t('toasts.thumbnailUpdated') });
        } catch (err) {
            showToastError({
                title: t('toasts.thumbnailCaptureFailed'),
                subtitle: getErrorMessage(err),
            });
        } finally {
            setIsCapturing(false);
        }
    }, [
        projectUuid,
        appUuid,
        version,
        capture,
        uploadThumbnail,
        queryClient,
        showToastSuccess,
        showToastError,
        t,
    ]);

    return { captureThumbnail, isCapturing };
};
