import {
    AI_THREAD_FILE_MAX_BYTES,
    isApiError,
    type AiPromptContextItem,
    type AiThreadFile,
    type ApiAiThreadFileResponse,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export type ThreadFileAttachment = Extract<
    AiPromptContextItem,
    { type: 'thread_file' }
>;

export type PendingThreadFile = {
    id: number;
    filename: string;
};

const THREAD_FILES_BASE = '/aiAgents/thread-files';

// Raw body + filename in the query string, matching the backend controller.
const uploadThreadFileApi = (file: File) => {
    const search = new URLSearchParams({ filename: file.name });
    return lightdashApi<ApiAiThreadFileResponse['results']>({
        url: `${THREAD_FILES_BASE}?${search.toString()}`,
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'text/plain' },
    });
};

const deleteThreadFileApi = (fileUuid: string) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `${THREAD_FILES_BASE}/${fileUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const toAttachment = (file: AiThreadFile): ThreadFileAttachment => ({
    type: 'thread_file',
    fileUuid: file.uuid,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
});

/**
 * Uploads text documents for the composer. Files are unattached until sent;
 * anything still unsent when the composer unmounts is deleted, and
 * `retainFiles` marks the ones that were sent so they survive.
 */
export const useThreadFileAttachment = ({
    onReady,
}: {
    onReady: (attachment: ThreadFileAttachment) => void;
}) => {
    const { showToastApiError, showToastError } = useToaster();
    const [pendingFiles, setPendingFiles] = useState<PendingThreadFile[]>([]);
    const pendingIdRef = useRef(0);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const mountedRef = useRef(true);
    const disposableFileUuidsRef = useRef(new Set<string>());

    useEffect(() => {
        const disposableFileUuids = disposableFileUuidsRef.current;
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            disposableFileUuids.forEach((fileUuid) => {
                void deleteThreadFileApi(fileUuid).catch(() => undefined);
            });
            disposableFileUuids.clear();
        };
    }, []);

    const attachFile = useCallback(
        async (file: File) => {
            if (file.size > AI_THREAD_FILE_MAX_BYTES) {
                showToastError({
                    title: 'Could not attach the file',
                    subtitle: `${file.name} is larger than the ${
                        AI_THREAD_FILE_MAX_BYTES / 1024
                    } KB limit.`,
                });
                return;
            }
            const pendingId = pendingIdRef.current;
            pendingIdRef.current += 1;
            setPendingFiles((files) => [
                ...files,
                { id: pendingId, filename: file.name },
            ]);
            try {
                const uploaded = await uploadThreadFileApi(file);
                if (!mountedRef.current) {
                    await deleteThreadFileApi(uploaded.uuid).catch(
                        () => undefined,
                    );
                    return;
                }
                disposableFileUuidsRef.current.add(uploaded.uuid);
                onReadyRef.current(toAttachment(uploaded));
            } catch (error) {
                if (!mountedRef.current) return;
                if (isApiError(error)) {
                    showToastApiError({
                        title: 'Could not attach the file',
                        apiError: error.error,
                    });
                } else {
                    showToastError({
                        title: 'Could not attach the file',
                        subtitle:
                            error instanceof Error
                                ? error.message
                                : 'Something went wrong while uploading.',
                    });
                }
            } finally {
                if (mountedRef.current) {
                    setPendingFiles((files) =>
                        files.filter(({ id }) => id !== pendingId),
                    );
                }
            }
        },
        [showToastApiError, showToastError],
    );

    const attachFiles = useCallback(
        async (files: File[]) => {
            await Promise.all(files.map(attachFile));
        },
        [attachFile],
    );

    const discardFile = useCallback(
        async (fileUuid: string) => {
            disposableFileUuidsRef.current.delete(fileUuid);
            try {
                await deleteThreadFileApi(fileUuid);
            } catch (error) {
                if (isApiError(error)) {
                    showToastApiError({
                        title: 'Could not remove the file',
                        apiError: error.error,
                    });
                }
            }
        },
        [showToastApiError],
    );

    const retainFiles = useCallback((fileUuids: string[]) => {
        fileUuids.forEach((fileUuid) =>
            disposableFileUuidsRef.current.delete(fileUuid),
        );
    }, []);

    return {
        attachFiles,
        discardFile,
        isUploading: pendingFiles.length > 0,
        pendingFiles,
        retainFiles,
    };
};
