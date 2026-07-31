import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    getAppFileSizeError,
    getAppFileValidationError,
    isSupportedAppImage,
} from '../utils/appFileAttachments';
import { useAppFileUpload } from './useAppFileUpload';

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
    const activeKeys = useRef(new Set<string>());
    const clearGeneration = useRef(0);
    const isActive = useRef(true);

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

    useEffect(() => {
        const keys = activeKeys.current;
        isActive.current = true;
        return () => {
            isActive.current = false;
            keys.clear();
            releasePreviews();
        };
    }, [releasePreviews]);

    const add = useCallback(
        (files: File[]) => {
            if (!projectUuid) return;
            const withinSize = files.flatMap((file) => {
                const error = getAppFileSizeError(file);
                if (!error) return [file];
                showToastError(error);
                return [];
            });
            const images = withinSize.filter(isSupportedAppImage);
            const filesToInspect = withinSize.filter(
                (file) => !isSupportedAppImage(file),
            );
            let warnedAboutLimit = false;
            const warnAboutLimit = () => {
                if (warnedAboutLimit) return;
                warnedAboutLimit = true;
                showToastWarning({
                    title: 'Attachment limit reached',
                    subtitle: `You can attach up to ${MAX_APP_FILES_PER_VERSION} files per message.`,
                });
            };

            const attach = (validatedFiles: File[]) => {
                validatedFiles.forEach((file) => {
                    if (activeKeys.current.size >= MAX_APP_FILES_PER_VERSION) {
                        warnAboutLimit();
                        return;
                    }
                    const key = String(nextKey.current++);
                    activeKeys.current.add(key);
                    const previewUrl = isSupportedAppImage(file)
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
                            if (!activeKeys.current.delete(key)) return;
                            revokePreview(key);
                            setAttachments((prev) =>
                                prev.filter((a) => a.key !== key),
                            );
                            showToastError({
                                title: 'Upload failed',
                                subtitle:
                                    'Please try again or contact support.',
                            });
                        });
                });
            };

            attach(images);
            const generation = clearGeneration.current;
            void Promise.all(
                filesToInspect.map(async (file) => ({
                    file,
                    error: await getAppFileValidationError(file),
                })),
            ).then((inspected) => {
                if (
                    !isActive.current ||
                    generation !== clearGeneration.current
                ) {
                    return;
                }
                const inspectedFiles = inspected.flatMap(({ file, error }) => {
                    if (!error) return [file];
                    showToastError(error);
                    return [];
                });
                attach(inspectedFiles);
            });
        },
        [
            projectUuid,
            appUuid,
            uploadFile,
            showToastError,
            showToastWarning,
            revokePreview,
        ],
    );

    const remove = useCallback(
        (key: string) => {
            activeKeys.current.delete(key);
            revokePreview(key);
            setAttachments((prev) => prev.filter((a) => a.key !== key));
        },
        [revokePreview],
    );

    const clear = useCallback(() => {
        clearGeneration.current += 1;
        activeKeys.current.clear();
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
