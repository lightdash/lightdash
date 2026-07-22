import type { ProjectContextEntry } from '@lightdash/common';

export type ProjectContextSearchEntry = ProjectContextEntry & {
    source?: 'context' | 'memory';
};

export type MemorySearchEntry = Pick<
    ProjectContextEntry,
    'content' | 'terms' | 'objects'
> & {
    slug: string;
};

export const getProjectContextSearchEntries = ({
    projectContext,
    memories,
    memoryEnabled,
}: {
    projectContext: ProjectContextEntry[];
    memories: MemorySearchEntry[];
    memoryEnabled: boolean;
}): ProjectContextSearchEntry[] => {
    if (!memoryEnabled) return projectContext;

    return [
        ...projectContext.map((entry) => ({
            ...entry,
            source: 'context' as const,
        })),
        ...memories.map((memory) => ({
            id: memory.slug,
            kind: 'context' as const,
            content: memory.content,
            terms: memory.terms,
            objects: memory.objects,
            source: 'memory' as const,
        })),
    ];
};
