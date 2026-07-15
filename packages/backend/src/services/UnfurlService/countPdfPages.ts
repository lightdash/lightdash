/**
 * Counts the page objects in a PDF by scanning the raw bytes for `/Type /Page`
 * markers — the same classic-xref parsing technique `cropPdfToClipInternal`
 * uses on Chromium's `page.pdf()` output (which emits uncompressed page objects,
 * so the markers appear in plaintext).
 *
 * Distinct object numbers are counted, not raw marker occurrences, so:
 * - `/Type /Pages` (the page-tree root) is excluded, and
 * - an incremental-update override of a page object (same object number, as
 *   `cropPdfToClipInternal` appends when cropping) is counted once.
 */
export function countPdfPages(buffer: Buffer): number {
    const pdfStr = buffer.toString('binary');
    const pageObjectNumbers = new Set<string>();
    const objectRegex = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
    let match = objectRegex.exec(pdfStr);
    while (match !== null) {
        // `/Type /Page` not followed by a name char excludes `/Type /Pages`.
        if (/\/Type\s*\/Page(?![A-Za-z])/.test(match[2])) {
            pageObjectNumbers.add(match[1]);
        }
        match = objectRegex.exec(pdfStr);
    }
    return pageObjectNumbers.size;
}
