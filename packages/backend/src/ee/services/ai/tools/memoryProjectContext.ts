import type { ProjectContextCitableEntry } from '@lightdash/common';
import type { AiAgentMemoryBlockEntry } from '../utils/memoryBlock';

/**
 * A memory as the search union carries it. It has no `kind`: kinds classify
 * project-context entries by retrieval intent, and forcing one onto a memory
 * made `kind` look like the tier discriminator. `source` is the discriminator.
 */
export type MemoryContextSearchEntry = {
    source: 'memory';
    slug: string;
    content: string;
    terms: string[];
    objects: AiAgentMemoryBlockEntry['objects'];
    memoryScope: AiAgentMemoryBlockEntry['scope'];
    memoryAgeDays: number;
};

export type ProjectContextSearchEntry =
    | (ProjectContextCitableEntry & { source: 'context' })
    | MemoryContextSearchEntry;

export type MemorySearchEntry = AiAgentMemoryBlockEntry & {
    terms: string[];
};

export const getProjectContextSearchEntries = ({
    projectContext,
    memories,
    memoryEnabled,
}: {
    projectContext: ProjectContextCitableEntry[];
    memories: MemorySearchEntry[];
    memoryEnabled: boolean;
}): ProjectContextSearchEntry[] => {
    const context = projectContext.map((entry) => ({
        ...entry,
        source: 'context' as const,
    }));
    if (!memoryEnabled) return context;

    return [
        ...context,
        ...memories.map((memory) => ({
            source: 'memory' as const,
            slug: memory.slug,
            content: memory.content,
            terms: memory.terms,
            objects: memory.objects,
            memoryScope: memory.scope,
            memoryAgeDays: memory.ageDays,
        })),
    ];
};
