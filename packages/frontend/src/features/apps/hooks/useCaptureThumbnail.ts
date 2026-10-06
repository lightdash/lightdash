import { isApiError } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppThumbnailUpload } from './useAppThumbnail';

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
          : 'Unknown error';

/** Captures the live preview and saves it as the thumbnail of the version on screen. */
export const useCaptureThumbnail = ({ app, capture }: Args) => {
    const queryClient = useQueryClient();
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
            void queryClient.invalidateQueries({
                queryKey: ['app-thumbnail', projectUuid, appUuid],
            });
            showToastSuccess({ title: 'Thumbnail updated' });
        } catch (err) {
            showToastError({
                title: 'Failed to capture thumbnail',
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
    ]);

    return { captureThumbnail, isCapturing };
};
