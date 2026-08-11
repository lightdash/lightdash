import { useContext } from 'react';
import { MergeContext, type MergeContextValue } from './context';

export const useMerge = (): MergeContextValue => {
    const context = useContext(MergeContext);
    if (!context) {
        throw new Error('useMerge must be used within a MergeProvider');
    }
    return context;
};

/**
 * Merge state when a provider is present, null when it is not.
 *
 * The explorer is rendered by several pages, and one forgetting the provider
 * should cost the merge control, not the whole page. `useMerge` still throws
 * for code that genuinely requires it.
 */
export const useMergeSafe = (): MergeContextValue | null =>
    useContext(MergeContext) ?? null;
