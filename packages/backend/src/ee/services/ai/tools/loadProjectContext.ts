import {
    formatAiProjectContextObjectRef,
    loadProjectContextToolDefinition,
    serializeAiProjectContextObjectRef,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import { renderMemoryBlock } from '../utils/memoryBlock';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { filterProjectContext } from './filterProjectContext';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

const MEMORY_AWARE_DESCRIPTION =
    'Load relevant project business context and memories. Project-context entries are authoritative over assumptions; memory entries are past-conversation reference material that must be verified against the current catalog. Pass `patterns` to load matching entries (recommended); omit to load all.';

type MemoryEntry = Extract<ProjectContextSearchEntry, { source: 'memory' }>;

const isMemoryEntry = (
    entry: ProjectContextSearchEntry,
): entry is MemoryEntry => entry.source === 'memory';

const renderMemories = (
    entries: ProjectContextSearchEntry[],
    getContent: (entry: MemoryEntry) => string,
): string | null =>
    renderMemoryBlock(
        entries.filter(isMemoryEntry).map((entry) => ({
            slug: entry.id,
            content: getContent(entry),
            scope: entry.memoryScope,
            objects: entry.objects,
            ageDays: entry.memoryAgeDays,
        })),
    );

const renderEntries = (entries: ProjectContextSearchEntry[]): string => {
    if (entries.length === 0) {
        return 'No project context is configured for this project.';
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
    const memoryBlock = renderMemories(entries, (entry) => entry.content);

    return [context, memoryBlock].filter(Boolean).join('\n');
};

// When patterns match nothing, list the available entries (id/kind/terms) so
// the agent can re-grep with broader keywords or load everything — cheaper than
// silently dumping the whole context.
const renderNoMatch = (all: ProjectContextSearchEntry[]): string => {
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
    const memoryBlock = renderMemories(all, (entry) =>
        entry.terms.length > 0
            ? `Available search terms: ${entry.terms.join(', ')}`
            : 'No search terms.',
    );
    const inventory = [context, memoryBlock].filter(Boolean).join('\n');

    return `No context entry matched your patterns. ${all.length} entries exist — re-grep with broader keywords, or call again without patterns to load all:\n${inventory}`;
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
        execute: async ({ patterns }) => {
            try {
                const entries = await getDocument();
                const selected = patterns?.length
                    ? filterProjectContext(entries, patterns)
                    : entries;

                // Patterns given but nothing matched: surface the available
                // entries instead of an empty result.
                if (patterns?.length && selected.length === 0) {
                    return {
                        result: renderNoMatch(entries),
                        metadata: {
                            status: 'success' as const,
                            entryIds: [],
                            approxTokens: 0,
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

                return {
                    result: renderEntries(selected),
                    metadata: {
                        status: 'success' as const,
                        entryIds,
                        approxTokens,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error loading project context',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
