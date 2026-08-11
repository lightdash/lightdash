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
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

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
    const prose = value.replace(FENCED_CODE_BLOCK_REGEX, '');
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
