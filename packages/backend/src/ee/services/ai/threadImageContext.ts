import {
    AI_THREAD_IMAGE_MAX_BYTES,
    AI_THREAD_IMAGES_MAX_PER_THREAD,
    AI_THREAD_IMAGES_MAX_THREAD_BYTES,
    NotFoundError,
    type AiPromptContext,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type FilePart } from 'ai';
import { addAbortSignal } from 'node:stream';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import { type AiThreadFileWithContent } from '../../models/AiThreadFileModel';

export type ResolvedThreadImage =
    | { status: 'available'; part: FilePart }
    | { status: 'expired' | 'missing' | 'incomplete' };

class ThreadImageIntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ThreadImageIntegrityError';
    }
}

const readImageBytes = async (
    file: Extract<AiThreadFileWithContent, { kind: 'image' }>,
    storage: Pick<FileStorageClient, 'getFileStream'>,
): Promise<Buffer> => {
    const abort = new AbortController();
    const timeoutError = new Error(
        'Reading an attached image timed out. Please retry.',
    );
    const deadline = new Promise<never>((_, reject) => {
        abort.signal.addEventListener('abort', () => reject(timeoutError), {
            once: true,
        });
    });
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
        return await Promise.race([
            (async () => {
                const { stream } = await storage.getFileStream(
                    file.storageKey,
                    { abortSignal: abort.signal },
                );
                addAbortSignal(abort.signal, stream);
                const chunks: Buffer[] = [];
                let size = 0;
                const source: AsyncIterable<unknown> = stream;
                for await (const chunk of source) {
                    if (!Buffer.isBuffer(chunk)) {
                        stream.destroy();
                        throw new ThreadImageIntegrityError(
                            'Image storage returned non-binary data',
                        );
                    }
                    size += chunk.length;
                    if (
                        size > AI_THREAD_IMAGE_MAX_BYTES ||
                        size > file.sizeBytes
                    ) {
                        stream.destroy();
                        throw new ThreadImageIntegrityError(
                            'An attached image exceeds its stored size.',
                        );
                    }
                    chunks.push(chunk);
                }
                if (size !== file.sizeBytes) {
                    throw new Error(
                        'An attached image could not be read completely. Please retry.',
                    );
                }
                return Buffer.concat(chunks, size);
            })(),
            deadline,
        ]);
    } finally {
        clearTimeout(timer);
    }
};

/** Only retained prompt contexts select bytes; files belonging to compacted turns are not fetched. */
export const resolveThreadImages = async ({
    contextMap,
    files,
    storage,
}: {
    contextMap: Map<string, AiPromptContext>;
    files: AiThreadFileWithContent[];
    storage: Pick<FileStorageClient, 'getFileStream'>;
}): Promise<Map<string, ResolvedThreadImage>> => {
    const references = [...contextMap].flatMap(([promptUuid, context]) =>
        context.flatMap((item) =>
            item.type === 'thread_image' ? [{ promptUuid, item }] : [],
        ),
    );
    const missingForBudget = () => {
        Sentry.captureException(
            new ThreadImageIntegrityError(
                'Conversation image metadata exceeds the attachment budget.',
            ),
        );
        return new Map<string, ResolvedThreadImage>(
            references.map(({ item }) => [
                item.fileUuid,
                { status: 'missing' },
            ]),
        );
    };
    if (
        references.length > AI_THREAD_IMAGES_MAX_PER_THREAD ||
        references.reduce((bytes, { item }) => bytes + item.sizeBytes, 0) >
            AI_THREAD_IMAGES_MAX_THREAD_BYTES
    ) {
        return missingForBudget();
    }
    const availableFiles = new Map(
        files
            .filter((file) => file.kind === 'image')
            .map((file) => [file.uuid, file]),
    );
    const resolved = new Map<string, ResolvedThreadImage>();
    let bytesRead = 0;
    for (const { promptUuid, item } of references) {
        const file = availableFiles.get(item.fileUuid);
        const expiresAt = Math.min(
            Date.parse(item.expiresAt),
            file?.expiresAt.getTime() ?? Infinity,
        );
        if (expiresAt <= Date.now()) {
            resolved.set(item.fileUuid, { status: 'expired' });
        } else if (
            !file ||
            file.promptUuid !== promptUuid ||
            file.objectDeletedAt !== null
        ) {
            resolved.set(item.fileUuid, { status: 'missing' });
        } else if (file.uploadedAt === null) {
            resolved.set(item.fileUuid, { status: 'incomplete' });
        } else {
            if (bytesRead + file.sizeBytes > AI_THREAD_IMAGES_MAX_THREAD_BYTES)
                return missingForBudget();
            try {
                // eslint-disable-next-line no-await-in-loop -- Bound memory and stop before reading beyond the shared byte budget.
                const bytes = await readImageBytes(file, storage);
                bytesRead += bytes.length;
                if (expiresAt <= Date.now()) {
                    resolved.set(item.fileUuid, { status: 'expired' });
                } else {
                    resolved.set(item.fileUuid, {
                        status: 'available',
                        part: {
                            type: 'file',
                            data: { type: 'data', data: bytes },
                            mediaType: file.mediaType,
                        },
                    });
                }
            } catch (error) {
                if (error instanceof ThreadImageIntegrityError)
                    Sentry.captureException(error);
                else if (!(error instanceof NotFoundError)) throw error;
                resolved.set(item.fileUuid, { status: 'missing' });
            }
        }
    }
    return resolved;
};
