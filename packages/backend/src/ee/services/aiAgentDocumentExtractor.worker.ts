import { assertUnreachable } from '@lightdash/common';
import mammoth from 'mammoth';
import { parentPort, workerData } from 'node:worker_threads';
import PDFParser from 'pdf2json';
import WordExtractor from 'word-extractor';
import type { WorkerExtractorKind } from './aiAgentDocumentExtractor';

type Args = {
    buffer: Buffer;
    kind: WorkerExtractorKind;
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

(async () => {
    const { buffer, kind }: Args = workerData;

    let content: string;
    switch (kind) {
        case 'docx': {
            const result = await mammoth.extractRawText({ buffer });
            content = result.value;
            break;
        }
        case 'doc':
            content = await extractWordText(buffer);
            break;
        case 'pdf':
            content = await extractPdfText(buffer);
            break;
        default:
            assertUnreachable(kind, `Unsupported extractor kind: ${kind}`);
    }

    if (parentPort) parentPort.postMessage(content);
})();
