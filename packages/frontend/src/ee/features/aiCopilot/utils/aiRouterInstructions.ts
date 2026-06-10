/**
 * Router instructions are stored as free text where tagged agents are embedded
 * as `@[Agent Name](agent-uuid)` tokens. These helpers convert between that
 * canonical text form and the HTML the tiptap editor reads/writes, and extract
 * the tagged agent UUIDs for the backend's `taggedAgentUuids` sidecar.
 */

const MENTION_TOKEN = /@\[([^\]]+)\]\(([^)]+)\)/g;

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export const extractTaggedAgentUuids = (instruction: string): string[] => {
    const uuids = new Set<string>();
    for (const match of instruction.matchAll(MENTION_TOKEN)) {
        uuids.add(match[2]);
    }
    return [...uuids];
};

const buildMentionSpan = (label: string, id: string): string =>
    `<span data-type="mention" data-id="${escapeHtml(id)}" data-label="${escapeHtml(
        label,
    )}">@${escapeHtml(label)}</span>`;

export const instructionTextToHtml = (instruction: string): string => {
    if (!instruction) return '';
    return instruction
        .split('\n')
        .map((line) => {
            let html = '';
            let lastIndex = 0;
            for (const match of line.matchAll(MENTION_TOKEN)) {
                const matchIndex = match.index ?? 0;
                html += escapeHtml(line.slice(lastIndex, matchIndex));
                html += buildMentionSpan(match[1], match[2]);
                lastIndex = matchIndex + match[0].length;
            }
            html += escapeHtml(line.slice(lastIndex));
            return `<p>${html || '<br>'}</p>`;
        })
        .join('');
};
