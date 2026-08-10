import {
    AGENT_CITATION_SLUG_PATTERN,
    AGENT_CITATION_TAG,
    getAgentCitationKey,
    isAgentCitationSource,
    LEGACY_MEMORY_CITATION_TAG,
    type AgentCitationSource,
} from '@lightdash/common';

export type AgentCitation = {
    source: AgentCitationSource;
    slug: string;
    /** How many markers in the answer pointed at this entry. */
    count: number;
};

export type ParsedAgentCitations = {
    /** Unique by (source, slug), in first-appearance order. */
    citations: AgentCitation[];
    /** Markers that looked like citations but carried no usable target. */
    malformedCount: number;
};

const CITATION_OPEN_REGEX = new RegExp(
    `<(${AGENT_CITATION_TAG}|${LEGACY_MEMORY_CITATION_TAG})\\b([^>]*)>`,
    'gi',
);
const CITATION_TAG_REGEX = new RegExp(
    `</?(?:${AGENT_CITATION_TAG}|${LEGACY_MEMORY_CITATION_TAG})\\b[^>]*>`,
    'gi',
);
const ATTRIBUTE_REGEX = /([a-zA-Z-]+)="([^"]*)"/g;
const SLUG_REGEX = new RegExp(`^${AGENT_CITATION_SLUG_PATTERN}$`);
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/**
 * Read the citation markers out of an answer. Both the unified tag and the
 * legacy memory-only tag are recognised; the legacy tag normalizes to
 * `source="memory"`. Anything that opens a citation tag but names no valid
 * source and slug is malformed: counted here and stripped from prose.
 */
export const parseAgentCitations = (value: string): ParsedAgentCitations => {
    const prose = value.replace(FENCED_CODE_BLOCK_REGEX, '');
    const byKey = new Map<string, AgentCitation>();
    let malformedCount = 0;

    for (const match of prose.matchAll(CITATION_OPEN_REGEX)) {
        const [, tag, rawAttributes] = match;
        const attributes = new Map(
            [...rawAttributes.matchAll(ATTRIBUTE_REGEX)].map(
                ([, name, attributeValue]) => [
                    name.toLowerCase(),
                    attributeValue,
                ],
            ),
        );
        const source =
            tag.toLowerCase() === LEGACY_MEMORY_CITATION_TAG
                ? 'memory'
                : attributes.get('source');
        const slug = attributes.get('id');

        if (!isAgentCitationSource(source) || !slug || !SLUG_REGEX.test(slug)) {
            malformedCount += 1;
        } else {
            const key = getAgentCitationKey({ source, slug });
            const existing = byKey.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                byKey.set(key, { source, slug, count: 1 });
            }
        }
    }

    return { citations: [...byKey.values()], malformedCount };
};

/** Slugs cited from one tier, in first-appearance order. */
export const getCitedSlugs = (
    citations: AgentCitation[],
    source: AgentCitationSource,
): string[] =>
    citations
        .filter((citation) => citation.source === source)
        .map((citation) => citation.slug);

/**
 * Which cited entries get their counters bumped. The two tiers are gated
 * differently on purpose: memory is personal and hidden behind the memory org
 * setting, project context is the shared tier and is counted regardless.
 */
export const planCitationTelemetry = ({
    citations,
    memoryEnabled,
}: {
    citations: AgentCitation[];
    memoryEnabled: boolean;
}): { memorySlugs: string[]; contextSlugs: string[] } => ({
    memorySlugs: memoryEnabled ? getCitedSlugs(citations, 'memory') : [],
    contextSlugs: getCitedSlugs(citations, 'context'),
});

/**
 * Remove every citation marker, of either tag. Markers are model output, so
 * every surface that re-reads an answer — Slack, replayed history, distill
 * transcripts, classifier snippets — must strip them.
 */
export const stripAgentCitations = (value: string): string =>
    value.replace(CITATION_TAG_REGEX, '');
