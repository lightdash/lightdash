// Shared citation mechanics for both knowledge tiers — the single place to
// change the tag later. Tier-specific mandates are appended per enabled tier.
const CITATION_MECHANICS = `## Citing sources

Cite knowledge entries inline with
\`<ld-mem-cite source="memory|context" id="slug"></ld-mem-cite>\`: append the
tag at the end of the sentence the entry supports — one slug per tag, adjacent
tags for several, never inside code fences. \`source\` names the tier the slug
came from (\`memory\` when omitted).`;

const MEMORY_CITATION_MANDATE = `- Memory entries: if ANY memory informed your answer, you MUST cite it with
  \`source="memory"\`.`;

const CONTEXT_CITATION_MANDATE = `- Project-context entries: cite with \`source="context"\` when the entry is
  load-bearing for a specific claim — a definition you used, a routing rule you
  followed — not when it merely shaped which explore you selected. Cite each
  entry at most once per answer.`;

export const getCitationsSection = ({
    memoryEnabled,
    hasProjectContext,
}: {
    memoryEnabled: boolean;
    hasProjectContext: boolean;
}): string => {
    if (!memoryEnabled && !hasProjectContext) return '';
    return [
        CITATION_MECHANICS,
        '',
        ...(memoryEnabled ? [MEMORY_CITATION_MANDATE] : []),
        ...(hasProjectContext ? [CONTEXT_CITATION_MANDATE] : []),
    ].join('\n');
};
