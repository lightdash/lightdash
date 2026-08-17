import { useMemo } from 'react';
import { parseMemoryCitationSlugs } from './parseMemoryCitationSlugs';

/**
 * Cited memory slugs for a message. Not gated on the org memory setting:
 * stored memories stay readable after generation is disabled.
 */
export const useMessageMemorySources = (markdown: string): string[] =>
    useMemo(() => parseMemoryCitationSlugs(markdown), [markdown]);
