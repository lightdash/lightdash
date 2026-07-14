import { useCallback, useState } from 'react';
import { useFilterBarPopovers } from './useFilterBarPopovers';

/**
 * Open state for filter bar popovers (filter chips, add-filter). Shared via
 * FilterBarPopoversContext when a provider is mounted, so other surfaces can
 * open a chip's popover; falls back to local state otherwise.
 */
export const useFilterPopoverState = () => {
    const filterBarPopovers = useFilterBarPopovers();
    const [localOpenPopoverId, setLocalPopoverId] = useState<string>();

    const openPopoverId =
        filterBarPopovers?.openFilterPopoverId ?? localOpenPopoverId;

    const onPopoverOpen = useCallback(
        (id: string) => {
            if (filterBarPopovers) {
                filterBarPopovers.openFilterPopover(id);
            } else {
                setLocalPopoverId(id);
            }
        },
        [filterBarPopovers],
    );

    const onPopoverClose = useCallback(() => {
        if (filterBarPopovers) {
            filterBarPopovers.closeFilterPopover();
        } else {
            setLocalPopoverId(undefined);
        }
    }, [filterBarPopovers]);

    return { openPopoverId, onPopoverOpen, onPopoverClose };
};
