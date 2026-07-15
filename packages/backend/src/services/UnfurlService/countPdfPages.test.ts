import { countPdfPages } from './countPdfPages';

const pageObject = (num: number, mediaBox = '[0 0 612 792]'): string =>
    `${num} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} >>\nendobj\n`;

describe('countPdfPages', () => {
    it('returns 0 when the document has only a page-tree root', () => {
        const pdf = Buffer.from(
            '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n',
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(0);
    });

    it('counts a single page object and ignores /Type /Pages', () => {
        const pdf = Buffer.from(
            `%PDF-1.4\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n${pageObject(
                3,
            )}`,
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(1);
    });

    it('counts one page per distinct page object', () => {
        const pdf = Buffer.from(
            `%PDF-1.4\n2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n${pageObject(
                3,
            )}${pageObject(4)}${pageObject(5)}`,
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(3);
    });

    it('counts an incremental-update page override once (cropPdfToClip output shape)', () => {
        // cropPdfToClipInternal appends a second copy of the SAME page object
        // (same object number, rewritten MediaBox) as an incremental update.
        const original = pageObject(3, '[0 0 612 792]');
        const overridden = pageObject(3, '[0 0 100 200]');
        const pdf = Buffer.from(
            `%PDF-1.4\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n${original}startxref\n0\n%%EOF\n${overridden}startxref\n0\n%%EOF\n`,
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(1);
    });

    it('tolerates whitespace/newline variants between /Type and /Page', () => {
        const pdf = Buffer.from(
            '3 0 obj\n<< /Type  /Page /X 1 >>\nendobj\n4 0 obj\n<< /Type\n/Page /X 2 >>\nendobj\n5 0 obj\n<< /Type /Pages >>\nendobj\n',
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(2);
    });

    it('counts a page whose /Page token ends at a delimiter with no trailing space', () => {
        const pdf = Buffer.from(
            '7 0 obj\n<< /Type /Page/Parent 2 0 R >>\nendobj\n',
            'binary',
        );
        expect(countPdfPages(pdf)).toBe(1);
    });
});
