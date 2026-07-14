import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers } from './pdfMerge';
import { cropPdfToClip } from './UnfurlService';

// Classic xref table (no object streams) — matches Chromium page.pdf output,
// which is what cropPdfToClip's hand-rolled parser expects.
const createPdf = async (
    widthPt: number,
    heightPt: number,
): Promise<Buffer> => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([widthPt, heightPt]);
    page.drawText('content', { x: 20, y: heightPt - 40 });
    return Buffer.from(await doc.save({ useObjectStreams: false }));
};

describe('mergePdfBuffers', () => {
    it('merges pages preserving unequal page sizes and sets title', async () => {
        const short = await createPdf(1050, 600);
        const tall = await createPdf(1050, 2250);
        const merged = await mergePdfBuffers([short, tall], 'My dashboard');
        const doc = await PDFDocument.load(new Uint8Array(merged));
        expect(doc.getPageCount()).toBe(2);
        expect(doc.getPage(0).getSize()).toEqual({ width: 1050, height: 600 });
        expect(doc.getPage(1).getSize()).toEqual({
            width: 1050,
            height: 2250,
        });
        expect(doc.getTitle()).toBe('My dashboard');
    });

    it('returns the single buffer untouched for one page', async () => {
        const only = await createPdf(1050, 600);
        const merged = await mergePdfBuffers([only], 'Solo');
        expect(merged.equals(only)).toBe(true);
    });

    it('merges buffers mutated by cropPdfToClip incremental updates', async () => {
        // 1050pt x 2250pt == Chromium page.pdf at 1400px x 3000px (px * 0.75)
        const raw = await createPdf(1050, 2250);
        const cropped = cropPdfToClip(raw, {
            x: 0,
            y: 0,
            width: 1400,
            height: 2500,
        });
        // Guard: the crop must have actually appended an incremental update —
        // otherwise this test silently stops covering the integration.
        expect(cropped.length).toBeGreaterThan(raw.length);

        const merged = await mergePdfBuffers([cropped, cropped], 'Cropped');
        const doc = await PDFDocument.load(new Uint8Array(merged));
        expect(doc.getPageCount()).toBe(2);
        // Cropped MediaBox: 2500px * 0.75 = 1875pt tall
        expect(doc.getPage(0).getSize().height).toBeCloseTo(1875, 0);
        expect(doc.getPage(0).getSize().width).toBeCloseTo(1050, 0);
    });

    it('throws on an empty list of buffers', async () => {
        await expect(mergePdfBuffers([], 'Empty')).rejects.toThrow(
            'Cannot merge an empty list of PDF buffers',
        );
    });
});
