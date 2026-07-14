import { PDFDocument } from 'pdf-lib';

/**
 * Merges single-page per-tab PDFs into one document, preserving each page's
 * own size (per-tab auto height). Input buffers may carry cropPdfToClip's
 * incremental updates; pdf-lib re-serializes them cleanly.
 */
export const mergePdfBuffers = async (
    buffers: Buffer[],
    title: string,
): Promise<Buffer> => {
    if (buffers.length === 0) {
        throw new Error('Cannot merge an empty list of PDF buffers');
    }
    if (buffers.length === 1) return buffers[0];

    const merged = await PDFDocument.create();
    merged.setTitle(title);
    for (const buffer of buffers) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await PDFDocument.load(new Uint8Array(buffer));
        // eslint-disable-next-line no-await-in-loop
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
    }
    return Buffer.from(await merged.save());
};
