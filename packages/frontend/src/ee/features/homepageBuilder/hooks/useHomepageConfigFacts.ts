import { createContext, useContext } from 'react';

type HomepageConfigFacts = {
    /** Whether any block in the page config is a quick-actions block. The AI
     * hero's content-first degrade uses it to avoid injecting a second set of
     * quick actions. */
    hasQuickActionsBlock: boolean;
};

/** Facts derived from the whole page config that individual blocks need but
 * cannot see on their own (a block only knows itself). The defaults are the
 * safe values for surfaces without a stored config (day-0, previews). */
export const HomepageConfigFactsContext = createContext<HomepageConfigFacts>({
    hasQuickActionsBlock: false,
});

export const useHomepageConfigFacts = () =>
    useContext(HomepageConfigFactsContext);
