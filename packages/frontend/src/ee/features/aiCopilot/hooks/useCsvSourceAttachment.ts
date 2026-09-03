import {
    ExternalSourceScope,
    ExternalSourceStatus,
    isApiError,
    type ExternalSource,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    deleteExternalSourceApi,
    getExternalSourceApi,
    useCommitCsvUpload,
    useUploadCsv,
} from '../../../../features/externalSources/hooks/useExternalSources';
import useToaster from '../../../../hooks/toaster/useToaster';

export type PendingCsvSource = {
    id: number;
    filename: string;
    status: 'queued' | 'preparing';
};

type QueuedCsvSource = {
    file: File;
    pendingId: number;
    resolve: () => void;
};

const SOURCE_POLL_INTERVAL_MS = 1000;
const SOURCE_POLL_TIMEOUT_MS = 70 * 60 * 1000;
const MAX_CONCURRENT_CSV_INGESTS = 2;

class SourcePreparationTimeoutError extends Error {}
class SourcePreparationCancelledError extends Error {}

const waitForPollInterval = (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new SourcePreparationCancelledError());
            return;
        }
        const timeout = window.setTimeout(() => {
            signal.removeEventListener('abort', cancel);
            resolve();
        }, SOURCE_POLL_INTERVAL_MS);
        const cancel = () => {
            window.clearTimeout(timeout);
            reject(new SourcePreparationCancelledError());
        };
        signal.addEventListener('abort', cancel, { once: true });
    });

const waitForSourceReady = async (
    projectUuid: string,
    initialSource: ExternalSource,
    signal: AbortSignal,
) => {
    let source = initialSource;
    const deadline = Date.now() + SOURCE_POLL_TIMEOUT_MS;

    while (true) {
        if (signal.aborted) throw new SourcePreparationCancelledError();
        if (
            source.status === ExternalSourceStatus.READY &&
            source.tables.length > 0
        ) {
            return source;
        }
        if (source.status === ExternalSourceStatus.ERROR) {
            throw new Error(
                source.errorMessage ??
                    'Something went wrong while preparing the source.',
            );
        }
        if (Date.now() >= deadline) break;

        await waitForPollInterval(signal);
        source = await getExternalSourceApi(projectUuid, source.sourceUuid);
    }

    throw new SourcePreparationTimeoutError(
        'The CSV is still preparing. Please try attaching it again later.',
    );
};

export const useCsvSourceAttachment = ({
    projectUuid,
    onReady,
}: {
    projectUuid: string | undefined;
    onReady: (source: ExternalSource) => void;
}) => {
    const uploadMutation = useUploadCsv(
        projectUuid,
        ExternalSourceScope.ATTACHMENT,
    );
    const commitMutation = useCommitCsvUpload(projectUuid);
    const { showToastApiError, showToastError } = useToaster();
    const [pendingFiles, setPendingFiles] = useState<PendingCsvSource[]>([]);
    const pendingIdRef = useRef(0);
    const queuedFilesRef = useRef<QueuedCsvSource[]>([]);
    const activeIngestsRef = useRef(0);
    const processQueueRef = useRef<() => void>(() => undefined);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const mountedRef = useRef(true);
    const pollingAbortControllerRef = useRef(new AbortController());
    const disposableSourceUuidsRef = useRef(new Set<string>());

    const deleteSource = useCallback(
        (sourceUuid: string) =>
            projectUuid
                ? deleteExternalSourceApi({ projectUuid, sourceUuid })
                : Promise.resolve(undefined),
        [projectUuid],
    );

    useEffect(() => {
        const queuedFiles = queuedFilesRef.current;
        const disposableSourceUuids = disposableSourceUuidsRef.current;
        const pollingAbortController = new AbortController();
        pollingAbortControllerRef.current = pollingAbortController;
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            pollingAbortController.abort();
            queuedFiles.splice(0).forEach(({ resolve }) => resolve());
            disposableSourceUuids.forEach((sourceUuid) => {
                void deleteSource(sourceUuid);
            });
            disposableSourceUuids.clear();
        };
    }, [deleteSource]);

    const prepareFile = useCallback(
        async (file: File, pendingId: number) => {
            if (!projectUuid) return;
            let sourceUuid: string;
            try {
                const stage = await uploadMutation.mutateAsync(file);
                sourceUuid = stage.sourceUuid;
            } catch {
                if (mountedRef.current) {
                    setPendingFiles((files) =>
                        files.filter(({ id }) => id !== pendingId),
                    );
                }
                return;
            }
            if (!mountedRef.current) {
                await deleteSource(sourceUuid).catch(() => undefined);
                return;
            }
            disposableSourceUuidsRef.current.add(sourceUuid);

            try {
                const committedSource = await commitMutation.mutateAsync({
                    sourceUuid,
                    payload: {},
                });
                const source = await waitForSourceReady(
                    projectUuid,
                    committedSource,
                    pollingAbortControllerRef.current.signal,
                );
                if (mountedRef.current) {
                    onReadyRef.current(source);
                } else {
                    await deleteSource(source.sourceUuid);
                }
            } catch (error) {
                if (
                    !(error instanceof SourcePreparationTimeoutError) &&
                    !(error instanceof SourcePreparationCancelledError)
                ) {
                    await deleteSource(sourceUuid).catch(() => undefined);
                    disposableSourceUuidsRef.current.delete(sourceUuid);
                }
                if (!mountedRef.current) return;
                if (isApiError(error)) {
                    showToastApiError({
                        title: 'Could not prepare the CSV',
                        apiError: error.error,
                    });
                } else {
                    showToastError({
                        title: 'Could not prepare the CSV',
                        subtitle:
                            error instanceof Error
                                ? error.message
                                : 'Something went wrong while preparing the source.',
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
        [
            commitMutation,
            deleteSource,
            projectUuid,
            showToastApiError,
            showToastError,
            uploadMutation,
        ],
    );

    const processQueue = useCallback(() => {
        while (
            activeIngestsRef.current < MAX_CONCURRENT_CSV_INGESTS &&
            queuedFilesRef.current.length > 0
        ) {
            const next = queuedFilesRef.current.shift();
            if (!next) return;

            activeIngestsRef.current += 1;
            if (mountedRef.current) {
                setPendingFiles((files) =>
                    files.map((pending) =>
                        pending.id === next.pendingId
                            ? { ...pending, status: 'preparing' }
                            : pending,
                    ),
                );
            }

            void prepareFile(next.file, next.pendingId).finally(() => {
                activeIngestsRef.current -= 1;
                next.resolve();
                processQueueRef.current();
            });
        }
    }, [prepareFile]);
    processQueueRef.current = processQueue;

    const attachFile = useCallback(
        (file: File): Promise<void> => {
            if (!projectUuid) return Promise.resolve();
            const pendingId = pendingIdRef.current;
            pendingIdRef.current += 1;
            setPendingFiles((files) => [
                ...files,
                { id: pendingId, filename: file.name, status: 'queued' },
            ]);

            return new Promise<void>((resolve) => {
                queuedFilesRef.current.push({ file, pendingId, resolve });
                processQueueRef.current();
            });
        },
        [projectUuid],
    );

    const attachFiles = useCallback(
        async (files: File[]) => {
            await Promise.all(files.map(attachFile));
        },
        [attachFile],
    );

    const discardSource = useCallback(
        async (sourceUuid: string) => {
            disposableSourceUuidsRef.current.delete(sourceUuid);
            try {
                await deleteSource(sourceUuid);
            } catch (error) {
                if (isApiError(error)) {
                    showToastApiError({
                        title: 'Could not remove the CSV',
                        apiError: error.error,
                    });
                }
            }
        },
        [deleteSource, showToastApiError],
    );

    const retainSources = useCallback((sourceUuids: string[]) => {
        sourceUuids.forEach((sourceUuid) =>
            disposableSourceUuidsRef.current.delete(sourceUuid),
        );
    }, []);

    return {
        attachFile,
        attachFiles,
        discardSource,
        isPreparing: pendingFiles.length > 0,
        pendingFiles,
        retainSources,
    };
};
