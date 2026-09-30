import {
    formatAiProjectContextObjectRef,
    loadProjectContextToolDefinition,
    serializeAiProjectContextObjectRef,
    type ToolLoadProjectContextOutput,
    type ToolLoadProjectContextStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import {
    AI_AGENT_MEMORY_BLOCK_MAX_CHARS,
    AI_AGENT_MEMORY_BLOCK_MAX_ROWS,
} from '../utils/memoryBlock';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { filterProjectContext } from './filterProjectContext';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

const MEMORY_AWARE_DESCRIPTION =
    'Load relevant project business context and memories. Project-context entries are authoritative over assumptions; memory entries are past-conversation reference material that must be verified against the current catalog. Pass `patterns` to load matching entries (recommended); omit to load all.';

type MemoryEntry = Extract<ProjectContextSearchEntry, { source: 'memory' }>;

type LoadedStructuredContent = Extract<
    ToolLoadProjectContextStructuredContent,
    { outcome: 'loaded' }
>;
type NoMatchStructuredContent = Extract<
    ToolLoadProjectContextStructuredContent,
    { outcome: 'no_match' }
>;
type SuccessMetadata = ToolLoadProjectContextOutput['metadata'] & {
    status: 'success';
    entryIds: string[];
    approxTokens: number;
};
type LoadProjectContextResult =
    | ExecuteStructuredToolResult<
          ToolLoadProjectContextStructuredContent,
          SuccessMetadata
      >
    | ExecuteToolErrorResult;

const isMemoryEntry = (
    entry: ProjectContextSearchEntry,
): entry is MemoryEntry => entry.source === 'memory';

const escapeXmlText = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

const escapeXmlAttribute = (value: string): string =>
    escapeXmlText(value).replaceAll('"', '&quot;');

const memoryTruncationNote = (count: number): string | null =>
    count > 0
        ? `(${count} more memories — search via loadProjectContext)`
        : null;

const wrapMemories = (rendered: string[], truncationNote: string | null) =>
    [
        '<ld-memories>',
        ...rendered,
        ...(truncationNote === null ? [] : [truncationNote]),
        '</ld-memories>',
    ].join('\n');

const renderMemories = (
    entries: ProjectContextSearchEntry[],
    getContent: (entry: MemoryEntry) => string,
): {
    block: string | null;
    entries: ProjectContextSearchEntry[];
    truncationNote: string | null;
} => {
    const memories = entries.filter(isMemoryEntry);
    if (memories.length === 0) {
        return { block: null, entries, truncationNote: null };
    }

    // Mirror the shared renderer locally to retain its bounded selection.
    const rendered: string[] = [];
    for (const entry of memories.slice(0, AI_AGENT_MEMORY_BLOCK_MAX_ROWS)) {
        const objects = entry.objects
            .map(formatAiProjectContextObjectRef)
            .join(', ');
        const row = `<ld-memory id="${escapeXmlAttribute(entry.id)}" scope="${escapeXmlAttribute(entry.memoryScope)}" age_days="${entry.memoryAgeDays}" objects="${escapeXmlAttribute(objects)}">${escapeXmlText(getContent(entry))}</ld-memory>`;
        const candidate = [...rendered, row];
        if (
            wrapMemories(
                candidate,
                memoryTruncationNote(memories.length - candidate.length),
            ).length > AI_AGENT_MEMORY_BLOCK_MAX_CHARS
        ) {
            break;
        }
        rendered.push(row);
    }

    let memoryIndex = 0;
    const truncationNote = memoryTruncationNote(
        memories.length - rendered.length,
    );
    return {
        block: wrapMemories(rendered, truncationNote),
        entries: entries.filter((entry) => {
            if (!isMemoryEntry(entry)) return true;
            memoryIndex += 1;
            return memoryIndex <= rendered.length;
        }),
        truncationNote,
    };
};

const renderProjectContext = (entries: ProjectContextSearchEntry[]) => {
    if (entries.length === 0) {
        return {
            result: 'No project context is configured for this project.',
            entries,
            truncationNote: null,
        };
    }
    const context = entries
        .filter(
            (
                entry,
            ): entry is ProjectContextSearchEntry & {
                source?: 'context';
            } => entry.source !== 'memory',
        )
        .map((entry) => {
            const terms =
                entry.terms.length > 0
                    ? ` terms: ${entry.terms.join(', ')};`
                    : '';
            const refs =
                entry.objects.length > 0
                    ? ` refs: ${entry.objects.map(formatAiProjectContextObjectRef).join(', ')};`
                    : '';
            const source = entry.source ? ' source: context;' : '';
            const prefix = `- id: ${entry.id};${source} kind: ${entry.kind};${terms}${refs}`;
            return `${prefix} content: ${entry.content}`;
        })
        .join('\n');
    const memories = renderMemories(entries, (entry) => entry.content);

    return {
        result: [context, memories.block].filter(Boolean).join('\n'),
        entries: memories.entries,
        truncationNote: memories.truncationNote,
    };
};

export const renderProjectContextEntries = (
    entries: ProjectContextSearchEntry[],
): string => renderProjectContext(entries).result;

const toLoadedEntry = (
    entry: ProjectContextSearchEntry,
): LoadedStructuredContent['entries'][number] =>
    isMemoryEntry(entry)
        ? {
              id: entry.id,
              source: 'memory',
              scope: entry.memoryScope,
              ageDays: entry.memoryAgeDays,
              objects: entry.objects,
              content: entry.content,
          }
        : {
              id: entry.id,
              ...(entry.source ? { source: entry.source } : {}),
              kind: entry.kind,
              terms: entry.terms,
              objects: entry.objects,
              content: entry.content,
          };

// When patterns match nothing, list the available entries (id/kind/terms) so
// the agent can re-grep with broader keywords or load everything — cheaper than
// silently dumping the whole context.
const renderNoMatch = (all: ProjectContextSearchEntry[]) => {
    const context = all
        .filter((entry) => entry.source !== 'memory')
        .map((entry) => {
            const terms =
                entry.terms.length > 0
                    ? ` terms: ${entry.terms.join(', ')};`
                    : '';
            const source = entry.source ? ` source: ${entry.source};` : '';
            return `- id: ${entry.id};${source} kind: ${entry.kind};${terms}`;
        })
        .join('\n');
    const memories = renderMemories(all, (entry) =>
        entry.terms.length > 0
            ? `Available search terms: ${entry.terms.join(', ')}`
            : 'No search terms.',
    );
    const inventory = [context, memories.block].filter(Boolean).join('\n');

    return {
        result: `No context entry matched your patterns. ${all.length} entries exist — re-grep with broader keywords, or call again without patterns to load all:\n${inventory}`,
        entries: memories.entries,
        truncationNote: memories.truncationNote,
    };
};

const toAvailableEntry = (
    entry: ProjectContextSearchEntry,
): NoMatchStructuredContent['available'][number] =>
    isMemoryEntry(entry)
        ? {
              id: entry.id,
              source: 'memory',
              scope: entry.memoryScope,
              ageDays: entry.memoryAgeDays,
              objects: entry.objects,
              terms: entry.terms,
          }
        : {
              id: entry.id,
              ...(entry.source ? { source: entry.source } : {}),
              kind: entry.kind,
              terms: entry.terms,
          };

export const getLoadProjectContext = ({
    getDocument,
    includeMemories = false,
    onEntriesLoaded,
}: {
    getDocument: () => Promise<ProjectContextSearchEntry[]>;
    includeMemories?: boolean;
    onEntriesLoaded?: (entries: ProjectContextSearchEntry[]) => Promise<void>;
}) =>
    tool({
        ...loadProjectContextToolDefinition.for('agent'),
        ...(includeMemories ? { description: MEMORY_AWARE_DESCRIPTION } : {}),
        execute: async ({ patterns }): Promise<LoadProjectContextResult> => {
            try {
                const entries = await getDocument();
                const selected = patterns?.length
                    ? filterProjectContext(entries, patterns)
                    : entries;

                // Patterns given but nothing matched: surface the available
                // entries instead of an empty result.
                if (patterns?.length && selected.length === 0) {
                    const rendered = renderNoMatch(entries);
                    return {
                        result: rendered.result,
                        metadata: {
                            status: 'success',
                            entryIds: [],
                            approxTokens: 0,
                        },
                        structuredContent: {
                            outcome: 'no_match',
                            totalEntries: entries.length,
                            available: rendered.entries.map(toAvailableEntry),
                            truncationNote: rendered.truncationNote,
                        },
                    };
                }

                try {
                    await onEntriesLoaded?.(selected);
                } catch (error) {
                    Logger.warn(
                        '[ProjectContext] failed to record loaded entries',
                        error,
                    );
                }

                const approxTokens = Math.ceil(
                    selected.reduce(
                        (sum, e) =>
                            sum +
                            e.content.length +
                            e.id.length +
                            e.terms.join(' ').length +
                            e.objects
                                .map(serializeAiProjectContextObjectRef)
                                .join(' ').length +
                            (e.source?.length ?? 0) +
                            32,
                        0,
                    ) / 4,
                );
                const entryIds = selected.map((e) => e.id);
                // Budget metric: what the agent actually loads per turn.
                Logger.info(
                    `[ProjectContext] loaded=${selected.length}/${
                        entries.length
                    } approxTokens=${approxTokens} patterns=${
                        patterns?.join('|') ?? '(all)'
                    } ids=${entryIds.join(',')}`,
                );

                const rendered = renderProjectContext(selected);
                return {
                    result: rendered.result,
                    metadata: {
                        status: 'success',
                        entryIds,
                        approxTokens,
                    },
                    structuredContent: {
                        outcome: 'loaded',
                        entries: rendered.entries.map(toLoadedEntry),
                        truncationNote: rendered.truncationNote,
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error loading project context');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
