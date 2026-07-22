import {
    formatAiProjectContextObjectRef,
    type AiProjectContextTypedObjectRef,
} from '@lightdash/common';

export const AI_AGENT_MEMORY_BLOCK_MAX_CHARS = 10_000;
export const AI_AGENT_MEMORY_BLOCK_MAX_ROWS = 30;
export const AI_AGENT_MEMORY_BLOCK_REGEX =
    /<ld-memories>[\s\S]*?<\/ld-memories>\s*/g;

const TRUNCATION_HINT = (count: number) =>
    `(${count} more memories — search via loadProjectContext)`;

const escapeXmlText = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

const escapeXmlAttribute = (value: string): string =>
    escapeXmlText(value).replaceAll('"', '&quot;');

export type AiAgentMemoryBlockEntry = {
    slug: string;
    content: string;
    objects: AiProjectContextTypedObjectRef[];
    ageDays: number;
};

const renderEntry = (entry: AiAgentMemoryBlockEntry): string => {
    const objects = entry.objects
        .map(formatAiProjectContextObjectRef)
        .join(', ');

    return `<ld-memory id="${escapeXmlAttribute(entry.slug)}" age_days="${entry.ageDays}" objects="${escapeXmlAttribute(objects)}">${escapeXmlText(entry.content)}</ld-memory>`;
};

const wrapEntries = (entries: string[], truncatedCount: number): string =>
    [
        '<ld-memories>',
        ...entries,
        ...(truncatedCount > 0 ? [TRUNCATION_HINT(truncatedCount)] : []),
        '</ld-memories>',
    ].join('\n');

export const renderMemoryBlock = (
    entries: AiAgentMemoryBlockEntry[],
): string | null => {
    if (entries.length === 0) return null;

    const rendered: string[] = [];
    const rowCandidates = entries.slice(0, AI_AGENT_MEMORY_BLOCK_MAX_ROWS);

    for (const entry of rowCandidates) {
        const candidate = [...rendered, renderEntry(entry)];
        const truncatedCount = entries.length - candidate.length;
        if (
            wrapEntries(candidate, truncatedCount).length >
            AI_AGENT_MEMORY_BLOCK_MAX_CHARS
        ) {
            break;
        }
        rendered.push(candidate.at(-1)!);
    }

    return wrapEntries(rendered, entries.length - rendered.length);
};

export const stripMemoryBlocks = (value: string): string =>
    value.replace(AI_AGENT_MEMORY_BLOCK_REGEX, '');
