import { createContext, useContext, useEffect } from 'react';

export type EmptyBlocksContextValue = {
    /** Blocks that have resolved their data and found nothing to show. */
    emptyBlockIds: ReadonlySet<string>;
    reportEmpty: (blockId: string, isEmpty: boolean) => void;
};

export const EmptyBlocksContext = createContext<EmptyBlocksContextValue>({
    emptyBlockIds: new Set(),
    reportEmpty: () => {},
});

export const useRuntimeEmptyBlocks = () => useContext(EmptyBlocksContext);

/**
 * Reports this block's resolved emptiness up to the page.
 *
 * `resolveHomepageLayout` guarantees that a block which paints nothing doesn't
 * hold a row, a gap or a column — but it decides that from config, and a
 * dynamic collection ("most viewed" in a project with no view history) can't
 * be judged that way. Emptiness becomes a runtime fact, so blocks report it
 * and the page drops the rows that turn out to be empty.
 *
 * This is a genuine child-to-parent synchronisation — the page can't run the
 * block's hooks itself — so it belongs in an effect rather than in render;
 * setting a provider's state mid-render throws. The block renders nothing
 * while loading and nothing when empty, so the row collapsing one commit later
 * is invisible: there's never a frame with an empty header on screen.
 */
export const useReportRuntimeEmpty = (
    blockId: string,
    isEmpty: boolean,
    isLoading: boolean,
) => {
    const { reportEmpty } = useRuntimeEmptyBlocks();
    useEffect(() => {
        if (isLoading) return;
        reportEmpty(blockId, isEmpty);
    }, [blockId, isEmpty, isLoading, reportEmpty]);

    useEffect(
        // A block that unmounts (an admin removing it, or a route change) must
        // not leave its id behind marking a row empty forever.
        () => () => reportEmpty(blockId, false),
        [blockId, reportEmpty],
    );
};
