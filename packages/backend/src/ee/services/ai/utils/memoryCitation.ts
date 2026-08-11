const MEMORY_CITATION_TAG = 'ld-mem-cite';
const MEMORY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

// Any tag pair or self-closing tag; attributes validated separately so an
// unknown `source` is counted as malformed instead of silently ignored.
const MEMORY_CITATION_CANDIDATE_REGEX = new RegExp(
    `<${MEMORY_CITATION_TAG}\\b([^>]*?)\\s*(?:\\/>|>\\s*<\\/${MEMORY_CITATION_TAG}\\s*>)`,
    'g',
);
// `source` is optional (missing = memory, so legacy tags stay valid) and may
// appear before or after `id`.
const MEMORY_CITATION_ATTRIBUTES_REGEX = new RegExp(
    `^\\s*(?:source="(memory|context)"\\s+)?id="(${MEMORY_SLUG})"(?:\\s+source="(memory|context)")?\\s*$`,
);
const MEMORY_CITATION_TAG_REGEX = new RegExp(
    `<\\/?${MEMORY_CITATION_TAG}\\b[^>]*>`,
    'gi',
);
const MEMORY_CITATION_OPEN_REGEX = new RegExp(
    `<${MEMORY_CITATION_TAG}\\b`,
    'gi',
);
const FENCE_LINE_REGEX = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// CommonMark-ish fence tracking so citation parsing matches rendering: a
// fence opens at line start (3+ of the same char), closes only on a line of
// the same char at >= the opening length, and an unclosed fence runs to EOF.
// Out of scope: inline code spans, indented code blocks, fences nested in
// lists/blockquotes.
const removeFencedCodeBlocks = (value: string): string => {
    const keptLines: string[] = [];
    let openFence: { char: string; length: number } | null = null;
    for (const line of value.split('\n')) {
        const match = line.match(FENCE_LINE_REGEX);
        if (openFence) {
            if (
                match &&
                match[1].startsWith(openFence.char) &&
                match[1].length >= openFence.length &&
                match[2].trim() === ''
            ) {
                openFence = null;
            }
        } else if (match && (match[1][0] === '~' || !match[2].includes('`'))) {
            // Backtick fence info strings can't contain backticks.
            openFence = { char: match[1][0], length: match[1].length };
        } else {
            keptLines.push(line);
        }
    }
    return keptLines.join('\n');
};

export type MemoryCitationSource = 'memory' | 'context';

export type MemoryCitationTier = {
    slugs: string[];
    citationCounts: Record<string, number>;
};

export type ParsedMemoryCitations = {
    memory: MemoryCitationTier;
    context: MemoryCitationTier;
    malformedCount: number;
};

const parseCitationAttributes = (
    attributes: string,
): { source: MemoryCitationSource; slug: string } | null => {
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

export const parseMemoryCitations = (value: string): ParsedMemoryCitations => {
    const prose = removeFencedCodeBlocks(value);
    const citationCounts: Record<
        MemoryCitationSource,
        Record<string, number>
    > = { memory: {}, context: {} };
    let malformedCount = 0;

    const leftover = prose.replace(
        MEMORY_CITATION_CANDIDATE_REGEX,
        (fullMatch, attributes: string) => {
            const citation = parseCitationAttributes(attributes);
            if (!citation) {
                malformedCount += 1;
                return '';
            }
            const counts = citationCounts[citation.source];
            counts[citation.slug] = (counts[citation.slug] ?? 0) + 1;
            return '';
        },
    );
    malformedCount += (leftover.match(MEMORY_CITATION_OPEN_REGEX) ?? []).length;

    return {
        memory: {
            slugs: Object.keys(citationCounts.memory),
            citationCounts: citationCounts.memory,
        },
        context: {
            slugs: Object.keys(citationCounts.context),
            citationCounts: citationCounts.context,
        },
        malformedCount,
    };
};

export const stripMemoryCitations = (value: string): string =>
    value.replace(MEMORY_CITATION_TAG_REGEX, '');
