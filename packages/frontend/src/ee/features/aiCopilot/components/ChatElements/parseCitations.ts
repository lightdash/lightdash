import {
    AGENT_CITATION_SLUG_PATTERN,
    AGENT_CITATION_TAG,
    getAgentCitationKey,
    isAgentCitationSource,
    LEGACY_MEMORY_CITATION_TAG,
    type AgentCitationSource,
} from '@lightdash/common';

export type MessageCitation = {
    source: AgentCitationSource;
    slug: string;
};

// Match the opening tag, closed or not: the renderer numbers the element the
// HTML parser produces either way, and the grid must stay in lockstep with it.
const CITATION_REGEX = new RegExp(
    `<(${AGENT_CITATION_TAG}|${LEGACY_MEMORY_CITATION_TAG})\\b([^>]*)>`,
    'gi',
);
const ATTRIBUTE_REGEX = /([a-zA-Z-]+)="([^"]*)"/g;
const SLUG_REGEX = new RegExp(`^${AGENT_CITATION_SLUG_PATTERN}$`);
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/** Same key the rehype numbering pass uses, so grid card N is marker N. */
export const getCitationKey = getAgentCitationKey;

/**
 * Unique cited entries in first-appearance order across both marker kinds —
 * the same order `rehypeCitationIndices` numbers the inline markers, so entry N
 * here matches marker N in the rendered message.
 */
export const parseCitations = (markdown: string): MessageCitation[] => {
    const prose = markdown.replace(FENCED_CODE_BLOCK_REGEX, '');
    const found: Array<{ index: number; citation: MessageCitation }> = [];

    for (const match of prose.matchAll(CITATION_REGEX)) {
        const [, tag, rawAttributes] = match;
        const attributes = new Map(
            [...rawAttributes.matchAll(ATTRIBUTE_REGEX)].map(
                ([, name, value]) => [name.toLowerCase(), value],
            ),
        );
        const source =
            tag.toLowerCase() === LEGACY_MEMORY_CITATION_TAG
                ? 'memory'
                : attributes.get('source');
        const slug = attributes.get('id');
        if (isAgentCitationSource(source) && slug && SLUG_REGEX.test(slug)) {
            found.push({ index: match.index, citation: { source, slug } });
        }
    }

    const seen = new Set<string>();
    return found.flatMap(({ citation }) => {
        const key = getCitationKey(citation);
        if (seen.has(key)) return [];
        seen.add(key);
        return [citation];
    });
};
