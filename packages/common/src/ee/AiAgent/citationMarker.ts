/**
 * The inline citation marker vocabulary, shared by the backend (emit, parse,
 * strip, count) and the frontend (number, render, resolve). It lives here so
 * changing the tag is one edit rather than a hunt across packages.
 */

/** The two knowledge tiers an answer can cite. */
export type AgentCitationSource = 'memory' | 'context';

export const AGENT_CITATION_TAG = 'ld-cite';

/** Emitted before the unified tag. Persisted messages are immutable, so this
 * is parsed, stripped, and rendered forever, normalized to `source="memory"`. */
export const LEGACY_MEMORY_CITATION_TAG = 'ld-mem-cite';

/** Slug grammar, identical for both tiers: kebab words, lowercase. */
export const AGENT_CITATION_SLUG_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const isAgentCitationSource = (
    value: unknown,
): value is AgentCitationSource => value === 'memory' || value === 'context';

/**
 * Identity of a citation. The tiers are separate namespaces — a memory and a
 * project-context entry may legitimately share a slug.
 */
export const getAgentCitationKey = (citation: {
    source: AgentCitationSource;
    slug: string;
}): string => `${citation.source}:${citation.slug}`;
