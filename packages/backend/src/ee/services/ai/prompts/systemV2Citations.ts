/**
 * The one place the citation tag is spelled out for the model. Both knowledge
 * tiers reference it, so changing the marker later is a single edit.
 */
export const getCitationsSection = ({
    memoryEnabled,
    projectContextEnabled,
}: {
    memoryEnabled: boolean;
    projectContextEnabled: boolean;
}): string => {
    if (!memoryEnabled && !projectContextEnabled) return '';

    const mandates = [
        ...(memoryEnabled
            ? [
                  `- Memory: if ANY memory informed your answer, you MUST cite it with \`source="memory"\`.`,
              ]
            : []),
        ...(projectContextEnabled
            ? [
                  `- Project context: cite with \`source="context"\` when an entry is load-bearing for a specific claim — a definition you applied, a routing rule you followed. Do not cite an entry that merely helped you pick an explore. Cite an entry at most once per answer.`,
              ]
            : []),
    ];

    return `## Citations

Attribute a sentence to the entry it came from with
\`<ld-cite source="memory|context" id="slug"></ld-cite>\`, placed at the end of
that sentence. \`id\` is the entry's \`id\` exactly as the tool result printed it,
and \`source\` is that entry's \`source\`. One entry per tag, adjacent tags for
several, never inside code fences.

${mandates.join('\n')}`;
};
