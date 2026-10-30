import {
    AI_THREAD_FILE_MAX_BYTES,
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    AI_THREAD_IMAGES_MAX_THREAD_BYTES,
    FeatureFlags,
    isApiError,
    type AiPromptContextItem,
    type AiThreadFile,
    type ApiSuccessEmpty,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';
import { normalizeThreadImage } from './normalizeThreadImage';

export type ThreadImageAttachment = Extract<
    AiPromptContextItem,
    { type: 'thread_image' }
> & { previewUrl: string };
export type ThreadFileAttachment =
    | Extract<AiPromptContextItem, { type: 'thread_file' }>
    | ThreadImageAttachment;

export type PendingThreadFile = { id: number; filename: string } & (
    | { kind: 'text'; status: 'uploading' }
    | { kind: 'image'; status: 'preparing' }
    | { kind: 'image'; status: 'uploading'; sizeBytes: number }
);
type PendingUpload = PendingThreadFile & { controller: AbortController };
const THREAD_FILES_BASE = '/aiAgents/thread-files';

// Previous-release pods omit kind; this endpoint only returns documents.
const uploadThreadFileApi = (
    lightdashApi: LightdashApi,
    file: File,
    signal: AbortSignal,
) => {
    const search = new URLSearchParams({ filename: file.name });
    return lightdashApi<Pick<AiThreadFile, 'uuid' | 'fileName' | 'sizeBytes'>>({
        url: `${THREAD_FILES_BASE}?${search.toString()}`,
        method: 'POST',
        body: file,
        sensitive: true,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal,
    });
};
const uploadThreadImageApi = (
    lightdashApi: LightdashApi,
    file: File,
    signal: AbortSignal,
) => {
    const search = new URLSearchParams({ filename: file.name });
    return lightdashApi<AiThreadFile>({
        url: `${THREAD_FILES_BASE}/images?${search.toString()}`,
        method: 'POST',
        body: file,
        sensitive: true,
        headers: { 'Content-Type': 'application/octet-stream' },
        signal,
    });
};
const deleteThreadFileApi = (lightdashApi: LightdashApi, fileUuid: string) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `${THREAD_FILES_BASE}/${fileUuid}`,
        method: 'DELETE',
        body: undefined,
    });
const isAbortError = (error: unknown) =>
    error instanceof DOMException && error.name === 'AbortError';
const imageBudgetError = () =>
    new Error(
        'Attach up to 5 images per message and 12 MiB of images per conversation. Remove an image or start a new conversation.',
    );

/** Unsent uploads are disposable. Retention protects a pending claim; previews live until success/removal. */
export const useThreadFileAttachment = ({
    onReady,
}: {
    onReady: (attachment: ThreadFileAttachment) => void;
}) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastError } = useToaster();
    const { data: imageFlag } = useServerFeatureFlag(
        FeatureFlags.AiThreadImages,
    );
    const isEmbedded = useIsEmbedded();
    const imagesEnabled = imageFlag?.enabled === true && !isEmbedded;
    const imagesEnabledRef = useRef(imagesEnabled);
    imagesEnabledRef.current = imagesEnabled;
    const [pendingFiles, setPendingFiles] = useState<PendingThreadFile[]>([]);
    const pendingIdRef = useRef(0);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const mountedRef = useRef(true);
    const inFlightRef = useRef(new Map<number, PendingUpload>());
    const disposableFileUuidsRef = useRef(new Set<string>());
    const readyImagesRef = useRef(
        new Map<string, { previewUrl: string; sizeBytes: number }>(),
    );
    // Only decoding/encoding is serialized; completed preparations may upload concurrently.
    const imagePreparationRef = useRef(Promise.resolve());
    const publishPending = useCallback(() => {
        if (mountedRef.current)
            setPendingFiles(
                Array.from(
                    inFlightRef.current.values(),
                    ({ controller: _controller, ...pending }) => pending,
                ),
            );
    }, []);
    const clearPreviews = useCallback((fileUuids: string[]) => {
        fileUuids.forEach((fileUuid) => {
            const image = readyImagesRef.current.get(fileUuid);
            if (image) URL.revokeObjectURL(image.previewUrl);
            readyImagesRef.current.delete(fileUuid);
        });
    }, []);
    useEffect(() => {
        mountedRef.current = true;
        const inFlight = inFlightRef.current;
        const disposable = disposableFileUuidsRef.current;
        const images = readyImagesRef.current;
        return () => {
            mountedRef.current = false;
            inFlight.forEach(({ controller }) => controller.abort());
            inFlight.clear();
            images.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
            images.clear();
            disposable.forEach((fileUuid) => {
                void deleteThreadFileApi(lightdashApi, fileUuid).catch(
                    () => undefined,
                );
            });
            disposable.clear();
        };
    }, [lightdashApi]);

    const beginUpload = useCallback(
        (
            filename: string,
            initial:
                | { kind: 'text'; status: 'uploading' }
                | { kind: 'image'; status: 'preparing' },
        ) => {
            const id = pendingIdRef.current;
            pendingIdRef.current += 1;
            const controller = new AbortController();
            inFlightRef.current.set(id, {
                ...initial,
                id,
                filename,
                controller,
            });
            publishPending();
            return { id, controller };
        },
        [publishPending],
    );
    const finishUpload = useCallback(
        (id: number) => {
            inFlightRef.current.delete(id);
            publishPending();
        },
        [publishPending],
    );
    const reportError = useCallback(
        (error: unknown) => {
            if (isApiError(error))
                showToastApiError({
                    title: 'Could not attach the file',
                    apiError: error.error,
                });
            else
                showToastError({
                    title: 'Could not attach the file',
                    subtitle:
                        error instanceof Error
                            ? error.message
                            : 'Something went wrong while uploading.',
                });
        },
        [showToastApiError, showToastError],
    );
    const deleteQuietly = useCallback(
        (fileUuid: string) => {
            disposableFileUuidsRef.current.delete(fileUuid);
            clearPreviews([fileUuid]);
            void deleteThreadFileApi(lightdashApi, fileUuid).catch(
                () => undefined,
            );
        },
        [clearPreviews, lightdashApi],
    );
    const imageBytesExcept = useCallback((excludedId: number) => {
        let bytes = 0;
        readyImagesRef.current.forEach((image) => {
            bytes += image.sizeBytes;
        });
        inFlightRef.current.forEach((pending, id) => {
            if (
                id !== excludedId &&
                pending.kind === 'image' &&
                pending.status === 'uploading'
            )
                bytes += pending.sizeBytes;
        });
        return bytes;
    }, []);

    const attachFile = useCallback(
        async (file: File) => {
            if (!mountedRef.current) return;
            if (file.size > AI_THREAD_FILE_MAX_BYTES) {
                showToastError({
                    title: 'Could not attach the file',
                    subtitle: `${file.name} is larger than the ${AI_THREAD_FILE_MAX_BYTES / 1024} KB limit.`,
                });
                return;
            }
            const { id, controller } = beginUpload(file.name, {
                kind: 'text',
                status: 'uploading',
            });
            let uploadedUuid: string | undefined;
            try {
                const uploaded = await uploadThreadFileApi(
                    lightdashApi,
                    file,
                    controller.signal,
                );
                uploadedUuid = uploaded.uuid;
                if (controller.signal.aborted || !mountedRef.current) {
                    deleteQuietly(uploaded.uuid);
                    return;
                }
                disposableFileUuidsRef.current.add(uploaded.uuid);
                onReadyRef.current({
                    type: 'thread_file',
                    fileUuid: uploaded.uuid,
                    fileName: uploaded.fileName,
                    sizeBytes: uploaded.sizeBytes,
                });
            } catch (error) {
                if (uploadedUuid !== undefined) deleteQuietly(uploadedUuid);
                if (
                    !isAbortError(error) &&
                    !controller.signal.aborted &&
                    mountedRef.current
                )
                    reportError(error);
            } finally {
                finishUpload(id);
            }
        },
        [
            beginUpload,
            deleteQuietly,
            finishUpload,
            lightdashApi,
            reportError,
            showToastError,
        ],
    );
    const attachFiles = useCallback(
        async (files: File[]) => {
            await Promise.all(files.map(attachFile));
        },
        [attachFile],
    );

    const attachImages = useCallback(
        async (files: File[]) => {
            if (!mountedRef.current) return;
            if (!imagesEnabledRef.current) {
                showToastError({
                    title: 'Image attachments are not enabled here',
                });
                return;
            }
            const tasks: Promise<void>[] = [];
            files.forEach((file) => {
                const pendingCount = Array.from(
                    inFlightRef.current.values(),
                ).filter((pending) => pending.kind === 'image').length;
                if (
                    readyImagesRef.current.size + pendingCount >=
                    AI_THREAD_IMAGES_MAX_PER_PROMPT
                ) {
                    reportError(imageBudgetError());
                    return;
                }
                // Reserve a slot synchronously, before any async read/decode begins.
                const { id, controller } = beginUpload(file.name, {
                    kind: 'image',
                    status: 'preparing',
                });
                const preparation = imagePreparationRef.current.then(
                    async () => {
                        if (controller.signal.aborted || !mountedRef.current)
                            return undefined;
                        if (!imagesEnabledRef.current)
                            throw new Error(
                                'Image attachments are not enabled here',
                            );
                        return normalizeThreadImage(file);
                    },
                );
                imagePreparationRef.current = preparation.then(
                    () => undefined,
                    () => undefined,
                );
                const task = (async () => {
                    let uploadedUuid: string | undefined;
                    try {
                        const normalized = await preparation;
                        if (
                            !normalized ||
                            controller.signal.aborted ||
                            !mountedRef.current
                        )
                            return;
                        if (
                            imageBytesExcept(id) + normalized.size >
                            AI_THREAD_IMAGES_MAX_THREAD_BYTES
                        )
                            throw imageBudgetError();
                        inFlightRef.current.set(id, {
                            id,
                            filename: file.name,
                            controller,
                            kind: 'image',
                            status: 'uploading',
                            sizeBytes: normalized.size,
                        });
                        publishPending();
                        const uploaded = await uploadThreadImageApi(
                            lightdashApi,
                            normalized,
                            controller.signal,
                        );
                        uploadedUuid = uploaded.uuid;
                        if (controller.signal.aborted || !mountedRef.current) {
                            deleteQuietly(uploaded.uuid);
                            return;
                        }
                        if (uploaded.kind !== 'image')
                            throw new Error(
                                'The server returned an unexpected attachment type. Please try again.',
                            );
                        if (
                            imageBytesExcept(id) + uploaded.sizeBytes >
                            AI_THREAD_IMAGES_MAX_THREAD_BYTES
                        )
                            throw imageBudgetError();
                        const attachment: ThreadImageAttachment = {
                            type: 'thread_image',
                            fileUuid: uploaded.uuid,
                            fileName: uploaded.fileName,
                            sizeBytes: uploaded.sizeBytes,
                            mediaType: uploaded.mediaType,
                            width: uploaded.width,
                            height: uploaded.height,
                            expiresAt: new Date(
                                uploaded.expiresAt,
                            ).toISOString(),
                            previewUrl: URL.createObjectURL(normalized),
                        };
                        disposableFileUuidsRef.current.add(uploaded.uuid);
                        inFlightRef.current.delete(id);
                        readyImagesRef.current.set(uploaded.uuid, {
                            previewUrl: attachment.previewUrl,
                            sizeBytes: uploaded.sizeBytes,
                        });
                        onReadyRef.current(attachment);
                    } catch (error) {
                        if (uploadedUuid !== undefined)
                            deleteQuietly(uploadedUuid);
                        if (
                            !isAbortError(error) &&
                            !controller.signal.aborted &&
                            mountedRef.current
                        )
                            reportError(error);
                    } finally {
                        finishUpload(id);
                    }
                })();
                tasks.push(task);
            });
            await Promise.all(tasks);
        },
        [
            beginUpload,
            deleteQuietly,
            finishUpload,
            imageBytesExcept,
            lightdashApi,
            publishPending,
            reportError,
            showToastError,
        ],
    );

    const cancelPendingFile = useCallback(
        (id: number) => {
            inFlightRef.current.get(id)?.controller.abort();
            finishUpload(id);
        },
        [finishUpload],
    );
    const discardFile = useCallback(
        async (fileUuid: string) => {
            clearPreviews([fileUuid]);
            try {
                await deleteThreadFileApi(lightdashApi, fileUuid);
                disposableFileUuidsRef.current.delete(fileUuid);
            } catch (error) {
                if (isApiError(error))
                    showToastApiError({
                        title: 'Could not remove the file',
                        apiError: error.error,
                    });
            }
        },
        [clearPreviews, lightdashApi, showToastApiError],
    );
    const retainFiles = useCallback((fileUuids: string[]) => {
        fileUuids.forEach((fileUuid) =>
            disposableFileUuidsRef.current.delete(fileUuid),
        );
    }, []);
    const releaseFiles = useCallback(
        (fileUuids: string[]) => {
            fileUuids.forEach((fileUuid) => {
                if (mountedRef.current)
                    disposableFileUuidsRef.current.add(fileUuid);
                else deleteQuietly(fileUuid);
            });
        },
        [deleteQuietly],
    );
    return {
        attachFiles,
        attachImages,
        imagesEnabled,
        cancelPendingFile,
        discardFile,
        isUploading: pendingFiles.length > 0,
        pendingFiles,
        retainFiles,
        releaseFiles,
        clearPreviews,
    };
};
