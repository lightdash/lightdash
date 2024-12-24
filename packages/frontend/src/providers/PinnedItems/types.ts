import type { ApiError, PinnedItems } from '@lightdash/common';
import type { UseMutateFunction } from '@tanstack/react-query';

export type PinnedItemsContextType = {
    userCanManage: boolean;
    reorderItems: UseMutateFunction<
        PinnedItems,
        ApiError,
        PinnedItems,
        unknown
    >;
    allowDelete: boolean;
};
