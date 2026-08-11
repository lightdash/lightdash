const MEMORY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

// Any tag pair or self-closing tag; attributes and body validated separately
// so an unknown `source` or an anchor-text body is ignored instead of
// mis-attributed.
const MEMORY_CITATION_CANDIDATE_REGEX = new RegExp(
    `<ld-mem-cite\\b([^>]*?)\\s*(?:\\/>|>([^<]*)<\\/ld-mem-cite\\s*>)`,
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

// HTML comments never render, so citations inside them must not count as
// sources. An unclosed `<!--` runs to EOF, matching the HTML parser.
const HTML_COMMENT_REGEX = /<!--[\s\S]*?(?:-->|$)/g;

const removeHtmlComments = (markdown: string): string =>
    markdown.replace(HTML_COMMENT_REGEX, '');

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

// Canonical citation grammar shared with `rehypeCitationIndices`: valid
// attributes AND an empty body (self-closing, or a whitespace-only pair).
const parseCitationCandidate = (
    attributes: string,
    body: string | undefined,
): ParsedMemoryCitation | null => {
    if (body !== undefined && body.trim() !== '') return null;
    return parseCitationAttributes(attributes);
};

/**
 * Unique citations per (source, slug) in first-appearance order — the same
 * order `rehypeCitationIndices` numbers the inline markers.
 */
export const parseMemoryCitations = (
    markdown: string,
): ParsedMemoryCitation[] => {
    const prose = removeHtmlComments(removeFencedCodeBlocks(markdown));
    const citations: ParsedMemoryCitation[] = [];
    for (const match of prose.matchAll(MEMORY_CITATION_CANDIDATE_REGEX)) {
        const citation = parseCitationCandidate(match[1], match[2]);
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
 * source, bad slug, anchor-text body) before rendering: the HTML pass
 * normalizes duplicate attributes away, so a malformed tag would otherwise
 * render as valid. A rejected pair is unwrapped so its body text survives.
 * Fenced code is left untouched — there the tag shows as literal code text.
 */
export const stripMalformedMemoryCitations = (markdown: string): string => {
    const regions = findFencedRegions(markdown);
    const inFence = (index: number) =>
        regions.some(({ start, end }) => index >= start && index < end);
    return markdown.replace(
        MEMORY_CITATION_CANDIDATE_REGEX,
        (
            fullMatch,
            attributes: string,
            body: string | undefined,
            offset: number,
        ) =>
            inFence(offset) || parseCitationCandidate(attributes, body) !== null
                ? fullMatch
                : (body ?? ''),
    );
};
