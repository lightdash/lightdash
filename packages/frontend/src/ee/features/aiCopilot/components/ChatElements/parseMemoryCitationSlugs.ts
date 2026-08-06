const MEMORY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

const VALID_MEMORY_CITATION_REGEX = new RegExp(
    `<ld-mem-cite\\s+id="(${MEMORY_SLUG})"\\s*(?:\\/>|>\\s*<\\/ld-mem-cite\\s*>)`,
    'g',
);
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/**
 * Unique cited memory slugs in first-appearance order — the same order
 * `rehypeMemoryCitationIndices` numbers the inline markers, so index N here
 * matches marker N in the rendered message.
 */
export const parseMemoryCitationSlugs = (markdown: string): string[] => {
    const prose = markdown.replace(FENCED_CODE_BLOCK_REGEX, '');
    const slugs: string[] = [];
    for (const match of prose.matchAll(VALID_MEMORY_CITATION_REGEX)) {
        if (!slugs.includes(match[1])) {
            slugs.push(match[1]);
        }
    }
    return slugs;
};
