import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppFileUpload } from './useAppFileUpload';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type VizAttachment = {
    fileId: string | null;
    filename: string;
    previewUrl: string | null;
    key: string;
};

type Args = {
    projectUuid: string | undefined;
    appUuid: string;
};

export type VizComposerAttachments = {
    attachments: VizAttachment[];
    isUploading: boolean;
    add: (files: File[]) => void;
    remove: (key: string) => void;
    clear: () => void;
    fileIds: string[];
};

export const useVizComposerAttachments = ({
    projectUuid,
    appUuid,
}: Args): VizComposerAttachments => {
    const [attachments, setAttachments] = useState<VizAttachment[]>([]);
    const { mutateAsync: uploadFile } = useAppFileUpload();
    const { showToastError, showToastWarning } = useToaster();
    const nextKey = useRef(0);
    const previewUrls = useRef(new Map<string, string>());

    const revokePreview = useCallback((key: string) => {
        const url = previewUrls.current.get(key);
        if (!url) return;

        URL.revokeObjectURL(url);
        previewUrls.current.delete(key);
    }, []);

    const releasePreviews = useCallback(() => {
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current.clear();
    }, []);

    useEffect(() => () => releasePreviews(), [releasePreviews]);

    const add = useCallback(
        (files: File[]) => {
            if (!projectUuid) return;
            const withinSize = files.filter((file) => {
                if (file.size <= MAX_FILE_SIZE) return true;
                showToastError({
                    title: 'File too large',
                    subtitle: `${file.name} exceeds the 10MB limit.`,
                });
                return false;
            });
            // Computing this outside the updater prevents duplicate toasts.
            const room = Math.max(
                0,
                MAX_APP_FILES_PER_VERSION - attachments.length,
            );
            if (withinSize.length > room) {
                showToastWarning({
                    title: 'Attachment limit reached',
                    subtitle: `You can attach up to ${MAX_APP_FILES_PER_VERSION} files per message.`,
                });
            }

            withinSize.slice(0, room).forEach((file) => {
                const key = String(nextKey.current++);
                const previewUrl = file.type.startsWith('image/')
                    ? URL.createObjectURL(file)
                    : null;
                if (previewUrl) previewUrls.current.set(key, previewUrl);

                setAttachments((prev) => [
                    ...prev,
                    { fileId: null, filename: file.name, previewUrl, key },
                ]);

                void uploadFile({ projectUuid, appUuid, file })
                    .then(({ fileId }) =>
                        setAttachments((prev) =>
                            prev.map((a) =>
                                a.key === key ? { ...a, fileId } : a,
                            ),
                        ),
                    )
                    .catch(() => {
                        revokePreview(key);
                        setAttachments((prev) =>
                            prev.filter((a) => a.key !== key),
                        );
                        showToastError({
                            title: 'Upload failed',
                            subtitle: 'Please try again or contact support.',
                        });
                    });
            });
        },
        [
            projectUuid,
            appUuid,
            attachments.length,
            uploadFile,
            showToastError,
            showToastWarning,
            revokePreview,
        ],
    );

    const remove = useCallback(
        (key: string) => {
            revokePreview(key);
            setAttachments((prev) => prev.filter((a) => a.key !== key));
        },
        [revokePreview],
    );

    const clear = useCallback(() => {
        releasePreviews();
        setAttachments([]);
    }, [releasePreviews]);

    return {
        attachments,
        isUploading: attachments.some((a) => a.fileId === null),
        add,
        remove,
        clear,
        fileIds: attachments
            .map((a) => a.fileId)
            .filter((id): id is string => id !== null),
    };
};
