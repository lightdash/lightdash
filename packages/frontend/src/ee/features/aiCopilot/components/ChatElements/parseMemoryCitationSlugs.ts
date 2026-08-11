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
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

export type MemoryCitationSource = 'memory' | 'context';

export type ParsedMemoryCitation = {
    source: MemoryCitationSource;
    slug: string;
};

/**
 * Unique citations per (source, slug) in first-appearance order — the same
 * order `rehypeMemoryCitationIndices` numbers the inline markers.
 */
export const parseMemoryCitations = (
    markdown: string,
): ParsedMemoryCitation[] => {
    const prose = markdown.replace(FENCED_CODE_BLOCK_REGEX, '');
    const citations: ParsedMemoryCitation[] = [];
    for (const match of prose.matchAll(MEMORY_CITATION_CANDIDATE_REGEX)) {
        const attributes = match[1].match(MEMORY_CITATION_ATTRIBUTES_REGEX);
        if (!attributes) continue;
        const [, sourceBefore, slug, sourceAfter] = attributes;
        if (sourceBefore && sourceAfter) continue;
        const source = (sourceBefore ??
            sourceAfter ??
            'memory') as MemoryCitationSource;
        if (
            !citations.some(
                (citation) =>
                    citation.source === source && citation.slug === slug,
            )
        ) {
            citations.push({ source, slug });
        }
    }
    return citations;
};

/** Unique cited memory-tier slugs, matching the memory sources list. */
export const parseMemoryCitationSlugs = (markdown: string): string[] =>
    parseMemoryCitations(markdown)
        .filter((citation) => citation.source === 'memory')
        .map((citation) => citation.slug);
