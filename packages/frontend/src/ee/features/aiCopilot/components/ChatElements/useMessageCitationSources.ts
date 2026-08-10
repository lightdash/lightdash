import { useMemo } from 'react';
import { useAiAgentMemoryEnabled } from '../../hooks/useAiOrganizationSettings';
import { parseCitations, type MessageCitation } from './parseCitations';

export type MessageCitationSource = MessageCitation & {
    /** Matches the inline marker's number, which counts both tiers. */
    index: number;
};

/**
 * The entries a message cites, in marker order. Memory citations drop out when
 * the memory org setting is off; project-context citations never do — they are
 * the shared knowledge tier. Numbers are assigned before that filter, so a
 * remaining card keeps the number its inline marker shows.
 */
export const useMessageCitationSources = (
    markdown: string,
): MessageCitationSource[] => {
    const memoryEnabled = useAiAgentMemoryEnabled();
    const citations = useMemo(
        () =>
            parseCitations(markdown).map((citation, position) => ({
                ...citation,
                index: position + 1,
            })),
        [markdown],
    );
    return useMemo(
        () =>
            memoryEnabled
                ? citations
                : citations.filter((citation) => citation.source !== 'memory'),
        [citations, memoryEnabled],
    );
};
