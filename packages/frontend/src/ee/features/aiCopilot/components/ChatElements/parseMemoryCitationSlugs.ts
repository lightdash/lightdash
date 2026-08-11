const MEMORY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

// Any tag pair or self-closing tag; attributes validated separately so an
// unknown `source` is ignored instead of mis-attributed.
const MEMORY_CITATION_CANDIDATE_REGEX = new RegExp(
    `<ld-mem-cite\\b([^>]*?)\\s*(?:\\/>|>\\s*<\\/ld-mem-cite\\s*>)`,
    'g',
);
// `source` is optional (missing = memory, so legacy messages stay valid) and
// may appear before or after `id`.
const MEMORY_CITATION_ATTRIBUTES_REGEX = new RegExp(
    `^\\s*(?:source="(memory|context)"\\s+)?id="(${MEMORY_SLUG})"(?:\\s+source="(memory|context)")?\\s*$`,
);

const FENCE_LINE_REGEX = /^ {0,3}(`{3,}|~{3,})(.*)$/;

type FenceRegion = { start: number; end: number };

// CommonMark-ish fence tracking so citation parsing matches rendering: a
// fence opens at line start (3+ of the same char), closes only on a line of
// the same char at >= the opening length, and an unclosed fence runs to EOF.
// Out of scope: inline code spans, indented code blocks, fences nested in
// lists/blockquotes.
const findFencedRegions = (markdown: string): FenceRegion[] => {
    const regions: FenceRegion[] = [];
    let openFence: { char: string; length: number; start: number } | null =
        null;
    let offset = 0;
    for (const line of markdown.split('\n')) {
        const lineEnd = offset + line.length;
        const match = line.match(FENCE_LINE_REGEX);
        if (openFence) {
            if (
                match &&
                match[1].startsWith(openFence.char) &&
                match[1].length >= openFence.length &&
                match[2].trim() === ''
            ) {
                regions.push({ start: openFence.start, end: lineEnd });
                openFence = null;
            }
        } else if (match && (match[1][0] === '~' || !match[2].includes('`'))) {
            // Backtick fence info strings can't contain backticks.
            openFence = {
                char: match[1][0],
                length: match[1].length,
                start: offset,
            };
        }
        offset = lineEnd + 1;
    }
    if (openFence) {
        regions.push({ start: openFence.start, end: markdown.length });
    }
    return regions;
};

const removeFencedCodeBlocks = (markdown: string): string => {
    const regions = findFencedRegions(markdown);
    let prose = '';
    let cursor = 0;
    for (const { start, end } of regions) {
        prose += markdown.slice(cursor, start);
        cursor = end;
    }
    return prose + markdown.slice(cursor);
};

export type MemoryCitationSource = 'memory' | 'context';

export type ParsedMemoryCitation = {
    source: MemoryCitationSource;
    slug: string;
};

const parseCitationAttributes = (
    attributes: string,
): ParsedMemoryCitation | null => {
    const match = attributes.match(MEMORY_CITATION_ATTRIBUTES_REGEX);
    if (!match) return null;
    const [, sourceBefore, slug, sourceAfter] = match;
    // A tag carrying `source` twice is malformed, not a tie-break.
    if (sourceBefore && sourceAfter) return null;
    return {
        source: (sourceBefore ??
            sourceAfter ??
            'memory') as MemoryCitationSource,
        slug,
    };
};

/**
 * Unique citations per (source, slug) in first-appearance order — the same
 * order `rehypeCitationIndices` numbers the inline markers.
 */
export const parseMemoryCitations = (
    markdown: string,
): ParsedMemoryCitation[] => {
    const prose = removeFencedCodeBlocks(markdown);
    const citations: ParsedMemoryCitation[] = [];
    for (const match of prose.matchAll(MEMORY_CITATION_CANDIDATE_REGEX)) {
        const citation = parseCitationAttributes(match[1]);
        if (!citation) continue;
        if (
            !citations.some(
                (existing) =>
                    existing.source === citation.source &&
                    existing.slug === citation.slug,
            )
        ) {
            citations.push(citation);
        }
    }
    return citations;
};

/**
 * Remove complete citation tags the parsers reject (unknown or duplicate
 * source, bad slug) before rendering: the HTML pass normalizes duplicate
 * attributes away, so a malformed tag would otherwise render as valid. Fenced
 * code is left untouched — there the tag shows as literal code text.
 */
export const stripMalformedMemoryCitations = (markdown: string): string => {
    const regions = findFencedRegions(markdown);
    const inFence = (index: number) =>
        regions.some(({ start, end }) => index >= start && index < end);
    return markdown.replace(
        MEMORY_CITATION_CANDIDATE_REGEX,
        (fullMatch, attributes: string, offset: number) =>
            inFence(offset) || parseCitationAttributes(attributes) !== null
                ? fullMatch
                : '',
    );
};
