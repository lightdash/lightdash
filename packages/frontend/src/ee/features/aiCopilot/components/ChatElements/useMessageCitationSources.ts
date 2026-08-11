import { useMemo } from 'react';
import { useAiAgentMemoryEnabled } from '../../hooks/useAiOrganizationSettings';
import {
    parseMemoryCitations,
    type ParsedMemoryCitation,
} from './parseMemoryCitationSlugs';

export type MessageCitationSource = ParsedMemoryCitation & { index: number };

/**
 * Cited sources for a message, numbered to match the unified inline markers.
 * Memory-tier sources are dropped when the feature is off; context sources
 * keep their unified numbers.
 */
export const useMessageCitationSources = (
    markdown: string,
): MessageCitationSource[] => {
    const memoryEnabled = useAiAgentMemoryEnabled();
    return useMemo(
        () =>
            parseMemoryCitations(markdown)
                .map((citation, idx) => ({ ...citation, index: idx + 1 }))
                .filter(
                    (citation) =>
                        citation.source === 'context' || memoryEnabled,
                ),
        [markdown, memoryEnabled],
    );
};
