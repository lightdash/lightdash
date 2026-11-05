const COLLAPSE_OVER_CHARS = 420;
const PREVIEW_CHARS = 260;
const SHORT_OPENER_CHARS = 120;
const OPENER_EXTENSION_CHARS = 180;

/** Leading markdown blocks of a long note, or null when it is short enough. */
export const collapseMarkdown = (text: string): string | null => {
    if (text.length <= COLLAPSE_OVER_CHARS) return null;
    const blocks = text.trim().split(/\n{2,}/);
    const kept: string[] = [];
    let length = 0;
    for (const block of blocks) {
        if (kept.length > 0 && length + block.length > PREVIEW_CHARS) break;
        kept.push(block);
        length += block.length;
    }
    // A one-line opener alone hides the substance; add the next block's first line, cut at a sentence.
    const nextLine = blocks[kept.length]?.split('\n')[0];
    if (
        length < SHORT_OPENER_CHARS &&
        nextLine !== undefined &&
        !/^\s*[#>|]/.test(nextLine)
    ) {
        const head = nextLine.slice(0, OPENER_EXTENSION_CHARS);
        const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('." '));
        if (nextLine.length <= head.length && /[.!?]$/.test(nextLine.trimEnd()))
            kept.push(nextLine);
        else if (cut > 0)
            kept.push(head.slice(0, cut + (head[cut + 1] === '"' ? 2 : 1)));
    }
    let preview = kept.join('\n\n');
    // A single long opening paragraph is cut at its last sentence that fits.
    if (preview.length > COLLAPSE_OVER_CHARS) {
        const head = preview.slice(0, PREVIEW_CHARS);
        const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'));
        preview = end > 0 ? head.slice(0, end + 1) : `${head.trimEnd()}…`;
    }
    return preview.length < text.trim().length ? preview : null;
};
