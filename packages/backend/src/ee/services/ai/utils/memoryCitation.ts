const MEMORY_CITATION_TAG = 'ld-mem-cite';
const MEMORY_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

const VALID_MEMORY_CITATION_REGEX = new RegExp(
    `<${MEMORY_CITATION_TAG}\\s+id="(${MEMORY_SLUG})"\\s*(?:\\/>|>\\s*<\\/${MEMORY_CITATION_TAG}\\s*>)`,
    'g',
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

export type ParsedMemoryCitations = {
    slugs: string[];
    malformedCount: number;
};

export const parseMemoryCitations = (value: string): ParsedMemoryCitations => {
    const prose = value.replace(FENCED_CODE_BLOCK_REGEX, '');
    const slugs = [
        ...new Set(
            [...prose.matchAll(VALID_MEMORY_CITATION_REGEX)].map(
                (match) => match[1],
            ),
        ),
    ];
    const malformedCount = (
        prose
            .replace(VALID_MEMORY_CITATION_REGEX, '')
            .match(MEMORY_CITATION_OPEN_REGEX) ?? []
    ).length;

    return { slugs, malformedCount };
};

export const stripMemoryCitations = (value: string): string =>
    value.replace(MEMORY_CITATION_TAG_REGEX, '');
