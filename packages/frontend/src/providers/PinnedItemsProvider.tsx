import { subject } from '@casl/ability';
import { type ApiError, type PinnedItems } from '@lightdash/common';
import { type UseMutateFunction } from '@tanstack/react-query';
import React, { createContext, useContext } from 'react';
import { useReorder } from '../hooks/pinning/usePinnedItems';
import { useApp } from './AppProvider';

type PinnedItemsContext = {
    userCanManage: boolean;
    reorderItems: UseMutateFunction<
        PinnedItems,
        ApiError,
        PinnedItems,
        unknown
    >;
    allowDelete: boolean;
};

const Context = createContext<PinnedItemsContext | null>(null);

type PinnedItemsProviderProps = {
    projectUuid: string;
    pinnedListUuid: string;
    organizationUuid: string;
    allowDelete?: boolean;
};

export const PinnedItemsProvider: React.FC<
    React.PropsWithChildren<PinnedItemsProviderProps>
> = ({
    organizationUuid,
    projectUuid,
    pinnedListUuid,
    allowDelete,
    children,
}) => {
    const { user } = useApp();
    const userCanManage =
        user.data?.ability.can(
            'manage',
            subject('PinnedItems', { organizationUuid, projectUuid }),
        ) ?? false;

    const { mutate: reorderItems } = useReorder(projectUuid, pinnedListUuid);

    const value: PinnedItemsContext = {
        userCanManage,
        reorderItems,
        allowDelete: allowDelete ?? true,
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const usePinnedItemsContext = (): PinnedItemsContext => {
    const context = useContext(Context);
    if (!context) {
        throw new Error(
            'usePinnedItemsContext must be used within a PinnedItemsContext',
        );
    }
    return context;
};
