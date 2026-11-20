import {
    AI_THREAD_IMAGE_MAX_BYTES,
    NotFoundError,
    ParameterError,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type FilePart, type ModelMessage } from 'ai';
import { addAbortSignal } from 'node:stream';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import { type AiThreadFileWithContent } from '../../models/AiThreadFileModel';

/** Battle mode sends one prompt to several models; images are not sent there. */
export const assertNoImagesInBattleMode = (
    context: AiPromptContextInput | undefined,
): void => {
    if (context?.some((item) => item.type === 'thread_image'))
        throw new ParameterError('Images are not available in battle mode');
};

export type ResolvedThreadImage =
    | { status: 'available'; part: FilePart }
    | { status: 'missing' | 'incomplete' | 'omitted' };

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

/** Marks every attached image with one status, without reading any bytes. */
export const threadImagesWithoutBytes = (
    contextMap: Map<string, AiPromptContext>,
    status: 'missing' | 'omitted',
): Map<string, ResolvedThreadImage> =>
    new Map(
        [...contextMap.values()].flatMap((context) =>
            context.flatMap((item): [string, ResolvedThreadImage][] =>
                item.type === 'thread_image'
                    ? [[item.fileUuid, { status }]]
                    : [],
            ),
        ),
    );

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
    const availableFiles = new Map(
        files
            .filter((file) => file.kind === 'image')
            .map((file) => [file.uuid, file]),
    );
    const resolved = new Map<string, ResolvedThreadImage>();
    for (const { promptUuid, item } of references) {
        const file = availableFiles.get(item.fileUuid);
        if (!file || file.promptUuid !== promptUuid) {
            resolved.set(item.fileUuid, { status: 'missing' });
        } else if (file.uploadedAt === null) {
            resolved.set(item.fileUuid, { status: 'incomplete' });
        } else {
            try {
                // eslint-disable-next-line no-await-in-loop -- One image in memory at a time while reading.
                const bytes = await readImageBytes(file, storage);
                resolved.set(item.fileUuid, {
                    status: 'available',
                    part: {
                        type: 'file',
                        data: { type: 'data', data: bytes },
                        mediaType: file.mediaType,
                    },
                });
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

/** Drops attached files from user turns, keeping their text and placeholders. */
export const withoutFileParts = (messages: ModelMessage[]): ModelMessage[] =>
    messages.map((message) =>
        message.role === 'user' && typeof message.content !== 'string'
            ? {
                  ...message,
                  content: message.content.filter(
                      (part) => part.type === 'text',
                  ),
              }
            : message,
    );
