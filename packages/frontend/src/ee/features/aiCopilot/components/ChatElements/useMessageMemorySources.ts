import { useMemo } from 'react';
import { parseMemoryCitationSlugs } from './parseMemoryCitationSlugs';

/** Cited memory slugs for a message; stays visible after memories are disabled. */
export const useMessageMemorySources = (markdown: string): string[] =>
    useMemo(() => parseMemoryCitationSlugs(markdown), [markdown]);
