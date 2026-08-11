import type { ProjectContextEntry } from '@lightdash/common';
import type { ProjectContextDocumentEntry } from '../../../models/ProjectContextModel';
import type { AiAgentMemoryBlockEntry } from '../utils/memoryBlock';

export type ProjectContextSearchEntry =
    | (ProjectContextDocumentEntry & {
          source: 'context';
          memoryScope?: never;
          memoryAgeDays?: never;
      })
    | {
          id: string;
          slug: string;
          kind?: never;
          content: string;
          terms: ProjectContextEntry['terms'];
          objects: AiAgentMemoryBlockEntry['objects'];
          source: 'memory';
          memoryScope: AiAgentMemoryBlockEntry['scope'];
          memoryAgeDays: number;
      };

export type MemorySearchEntry = AiAgentMemoryBlockEntry &
    Pick<ProjectContextEntry, 'terms'>;

export const getProjectContextSearchEntries = ({
    projectContext,
    memories,
    memoryEnabled,
}: {
    projectContext: ProjectContextDocumentEntry[];
    memories: MemorySearchEntry[];
    memoryEnabled: boolean;
}): ProjectContextSearchEntry[] => {
    const contextEntries = projectContext.map((entry) => ({
        ...entry,
        source: 'context' as const,
    }));
    if (!memoryEnabled) return contextEntries;

    return [
        ...contextEntries,
        ...memories.map((memory) => ({
            id: memory.slug,
            slug: memory.slug,
            content: memory.content,
            terms: memory.terms,
            objects: memory.objects,
            source: 'memory' as const,
            memoryScope: memory.scope,
            memoryAgeDays: memory.ageDays,
        })),
    ];
};
