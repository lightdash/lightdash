import { useMemo } from 'react';
import { useAiAgentMemoryEnabled } from '../../hooks/useAiOrganizationSettings';
import { parseMemoryCitationSlugs } from './parseMemoryCitationSlugs';

/** Cited memory slugs for a message, empty when the feature is off. */
export const useMessageMemorySources = (markdown: string): string[] => {
    const memoryEnabled = useAiAgentMemoryEnabled();
    const slugs = useMemo(() => parseMemoryCitationSlugs(markdown), [markdown]);
    return memoryEnabled ? slugs : [];
};
