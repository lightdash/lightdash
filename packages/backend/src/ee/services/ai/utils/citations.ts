// Inline citation markers the agent appends to a sentence its answer leans on.
// Memories cite by slug, project-context entries by entry id; both are parsed
// out for telemetry and stripped from every surface that re-reads the prose.
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

export type ParsedCitations = {
    ids: string[];
    citationCounts: Record<string, number>;
    malformedCount: number;
};

const createCitationTag = ({
    tag,
    idPattern,
}: {
    tag: string;
    idPattern: string;
}) => {
    const validRegex = new RegExp(
        `<${tag}\\s+id="(${idPattern})"\\s*(?:\\/>|>\\s*<\\/${tag}\\s*>)`,
        'g',
    );
    const anyTagRegex = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    const openTagRegex = new RegExp(`<${tag}\\b`, 'gi');

    return {
        parse: (value: string): ParsedCitations => {
            const prose = value.replace(FENCED_CODE_BLOCK_REGEX, '');
            const citationCounts: Record<string, number> = {};
            [...prose.matchAll(validRegex)].forEach((match) => {
                const id = match[1];
                citationCounts[id] = (citationCounts[id] ?? 0) + 1;
            });
            const malformedCount = (
                prose.replace(validRegex, '').match(openTagRegex) ?? []
            ).length;

            return {
                ids: Object.keys(citationCounts),
                citationCounts,
                malformedCount,
            };
        },
        strip: (value: string): string => value.replace(anyTagRegex, ''),
    };
};

const memoryCitations = createCitationTag({
    tag: 'ld-mem-cite',
    idPattern: '[a-z0-9]+(?:-[a-z0-9]+)*',
});

// Entry ids are author-written, so they are laxer than memory slugs: anything
// without whitespace, quotes or angle brackets, which keeps the id usable as an
// HTML attribute the frontend can round-trip.
const projectContextCitations = createCitationTag({
    tag: 'ld-ctx-cite',
    idPattern: '[^\\s"<>]{1,120}',
});

export type ParsedMemoryCitations = Omit<ParsedCitations, 'ids'> & {
    slugs: string[];
};

export const parseMemoryCitations = (value: string): ParsedMemoryCitations => {
    const { ids, ...rest } = memoryCitations.parse(value);
    return { slugs: ids, ...rest };
};

export const stripMemoryCitations = memoryCitations.strip;

export const parseProjectContextCitations = projectContextCitations.parse;

export const stripProjectContextCitations = projectContextCitations.strip;

/** Strip every citation marker: what any surface re-reading the prose wants. */
export const stripAgentCitations = (value: string): string =>
    stripProjectContextCitations(stripMemoryCitations(value));
