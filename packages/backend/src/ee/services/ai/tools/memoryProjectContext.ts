import type { ProjectContextEntry } from '@lightdash/common';
import type { AiAgentMemoryBlockEntry } from '../utils/memoryBlock';

export type ProjectContextSearchEntry =
    | (ProjectContextEntry & {
          source?: 'context';
          memoryScope?: never;
          memoryAgeDays?: never;
      })
    | (Omit<ProjectContextEntry, 'objects'> & {
          objects: AiAgentMemoryBlockEntry['objects'];
          source: 'memory';
          memoryScope: AiAgentMemoryBlockEntry['scope'];
          memoryAgeDays: number;
      });

export type MemorySearchEntry = AiAgentMemoryBlockEntry &
    Pick<ProjectContextEntry, 'terms'>;

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
            memoryScope: memory.scope,
            memoryAgeDays: memory.ageDays,
        })),
    ];
};
