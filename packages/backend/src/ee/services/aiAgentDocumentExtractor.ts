import {
    AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS,
    assertUnreachable,
    ParameterError,
    TimeoutError,
} from '@lightdash/common';
import { Worker } from 'node:worker_threads';
import { runWorkerThread, WorkerThreadTimeoutError } from '../../utils';

export type SupportedDocumentKind =
    | 'markdown'
    | 'text'
    | 'csv'
    | 'docx'
    | 'doc'
    | 'pdf';

export type WorkerExtractorKind = Extract<
    SupportedDocumentKind,
    'docx' | 'doc' | 'pdf'
>;
type SupportedDocumentType = {
    kind: SupportedDocumentKind;
    mimeType: string;
    storageExtension: string;
};

const SUPPORTED_MIME_TYPES = new Map<string, SupportedDocumentType>([
    [
        'text/markdown',
        { kind: 'markdown', mimeType: 'text/markdown', storageExtension: 'md' },
    ],
    [
        'text/x-markdown',
        { kind: 'markdown', mimeType: 'text/markdown', storageExtension: 'md' },
    ],
    [
        'text/plain',
        { kind: 'text', mimeType: 'text/plain', storageExtension: 'txt' },
    ],
    [
        'text/csv',
        { kind: 'csv', mimeType: 'text/csv', storageExtension: 'csv' },
    ],
    [
        'application/csv',
        { kind: 'csv', mimeType: 'text/csv', storageExtension: 'csv' },
    ],
    [
        'application/vnd.ms-excel',
        { kind: 'csv', mimeType: 'text/csv', storageExtension: 'csv' },
    ],
    [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        {
            kind: 'docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            storageExtension: 'txt',
        },
    ],
    [
        'application/msword',
        {
            kind: 'doc',
            mimeType: 'application/msword',
            storageExtension: 'txt',
        },
    ],
    [
        'application/pdf',
        {
            kind: 'pdf',
            mimeType: 'application/pdf',
            storageExtension: 'txt',
        },
    ],
]);

const SUPPORTED_EXTENSIONS = new Map<string, SupportedDocumentType>([
    [
        '.md',
        { kind: 'markdown', mimeType: 'text/markdown', storageExtension: 'md' },
    ],
    [
        '.markdown',
        { kind: 'markdown', mimeType: 'text/markdown', storageExtension: 'md' },
    ],
    ['.txt', { kind: 'text', mimeType: 'text/plain', storageExtension: 'txt' }],
    ['.csv', { kind: 'csv', mimeType: 'text/csv', storageExtension: 'csv' }],
    [
        '.docx',
        {
            kind: 'docx',
            mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            storageExtension: 'txt',
        },
    ],
    [
        '.doc',
        {
            kind: 'doc',
            mimeType: 'application/msword',
            storageExtension: 'txt',
        },
    ],
    [
        '.pdf',
        {
            kind: 'pdf',
            mimeType: 'application/pdf',
            storageExtension: 'txt',
        },
    ],
]);

const allowedExtensionsMessage = `Allowed extensions: ${AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS.join(
    ', ',
)}.`;

const getExtension = (filename: string): string => {
    const match = filename.toLowerCase().match(/\.[^.]+$/);
    return match?.[0] ?? '';
};

export const normalizeAiAgentDocumentMimeType = (
    mimeType: string,
    filename: string,
): SupportedDocumentType => {
    const extensionType = SUPPORTED_EXTENSIONS.get(getExtension(filename));
    if (extensionType) {
        return extensionType;
    }

    const mimeTypeMatch = SUPPORTED_MIME_TYPES.get(mimeType.toLowerCase());
    if (mimeTypeMatch) {
        return mimeTypeMatch;
    }

    throw new ParameterError(
        `Unsupported file type. ${allowedExtensionsMessage}`,
    );
};

export const normalizeExtractedDocumentText = (text: string): string =>
    text
        .replace(/^\uFEFF/, '')
        .replaceAll('\u0000', '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();

const assertHasReadableText = (content: string): string => {
    const normalized = normalizeExtractedDocumentText(content);
    if (normalized.length === 0) {
        throw new ParameterError('No readable text found in this document.');
    }
    return normalized;
};

const EXTRACTOR_WORKER_PATH =
    './dist/ee/services/aiAgentDocumentExtractor.worker.js';

const extractInWorker = async (
    buffer: Buffer,
    kind: WorkerExtractorKind,
    timeoutMs: number,
): Promise<string> => {
    const worker = new Worker(EXTRACTOR_WORKER_PATH, {
        workerData: { buffer, kind },
    });
    try {
        return await runWorkerThread<string>(worker, timeoutMs);
    } catch (err) {
        if (err instanceof WorkerThreadTimeoutError) {
            throw new TimeoutError(
                `Document took too long to process. Try a smaller or simpler file.`,
            );
        }
        throw err;
    }
};

export const extractAiAgentDocumentText = async ({
    buffer,
    mimeType,
    filename,
    timeoutMs,
}: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
    timeoutMs: number;
}): Promise<{
    content: string;
    mimeType: string;
    storageExtension: string;
}> => {
    const documentType = normalizeAiAgentDocumentMimeType(mimeType, filename);

    switch (documentType.kind) {
        case 'markdown':
        case 'text':
        case 'csv':
            return {
                content: assertHasReadableText(buffer.toString('utf8')),
                mimeType: documentType.mimeType,
                storageExtension: documentType.storageExtension,
            };
        case 'docx':
        case 'doc':
        case 'pdf':
            return {
                content: assertHasReadableText(
                    await extractInWorker(buffer, documentType.kind, timeoutMs),
                ),
                mimeType: documentType.mimeType,
                storageExtension: documentType.storageExtension,
            };
        default:
            return assertUnreachable(
                documentType.kind,
                `Unsupported file type. ${allowedExtensionsMessage}`,
            );
    }
};
