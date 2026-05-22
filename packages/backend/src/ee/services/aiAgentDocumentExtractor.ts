import {
    AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS,
    ParameterError,
} from '@lightdash/common';
import mammoth from 'mammoth';
import PDFParser from 'pdf2json';
import WordExtractor from 'word-extractor';

type SupportedDocumentKind =
    | 'markdown'
    | 'text'
    | 'csv'
    | 'docx'
    | 'doc'
    | 'pdf';

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

const extractWordText = async (buffer: Buffer): Promise<string> => {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    return [
        doc.getHeaders({ includeFooters: false }),
        doc.getBody(),
        doc.getTextboxes(),
        doc.getFootnotes(),
        doc.getEndnotes(),
        doc.getAnnotations(),
        doc.getFooters(),
    ]
        .filter(Boolean)
        .join('\n\n');
};

const decodePdfText = (text: string): string => {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
};

const extractPdfText = (buffer: Buffer): Promise<string> =>
    new Promise((resolve, reject) => {
        const parser = new PDFParser(null, true);
        parser.on('pdfParser_dataError', (err) => {
            parser.destroy();
            reject(err instanceof Error ? err : err.parserError);
        });
        parser.on('pdfParser_dataReady', () => {
            const rawText = parser.getRawTextContent();
            parser.destroy();
            resolve(decodePdfText(rawText));
        });
        parser.parseBuffer(buffer);
    });

export const extractAiAgentDocumentText = async ({
    buffer,
    mimeType,
    filename,
}: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
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
        case 'docx': {
            const result = await mammoth.extractRawText({ buffer });
            return {
                content: assertHasReadableText(result.value),
                mimeType: documentType.mimeType,
                storageExtension: documentType.storageExtension,
            };
        }
        case 'doc':
            return {
                content: assertHasReadableText(await extractWordText(buffer)),
                mimeType: documentType.mimeType,
                storageExtension: documentType.storageExtension,
            };
        case 'pdf':
            return {
                content: assertHasReadableText(await extractPdfText(buffer)),
                mimeType: documentType.mimeType,
                storageExtension: documentType.storageExtension,
            };
        default:
            throw new ParameterError(
                `Unsupported file type. ${allowedExtensionsMessage}`,
            );
    }
};
