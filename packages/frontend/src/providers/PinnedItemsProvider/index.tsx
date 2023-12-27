import { subject } from '@casl/ability';
import { ApiError, PinnedItems } from '@lightdash/common';
import React, { createContext } from 'react';
import { UseMutateFunction } from 'react-query';
import { useReorder } from '../../hooks/pinning/usePinnedItems';
import { useApp } from '../AppProvider/useApp';

export type PinnedItemsContext = {
    userCanManage: boolean;
    reorderItems: UseMutateFunction<
        PinnedItems,
        ApiError,
        PinnedItems,
        unknown
    >;
};

export const Context = createContext<PinnedItemsContext | null>(null);

type PinnedItemsProviderProps = {
    projectUuid: string;
    pinnedListUuid: string;
    organizationUuid: string;
};

export const PinnedItemsProvider: React.FC<PinnedItemsProviderProps> = ({
    organizationUuid,
    projectUuid,
    pinnedListUuid,
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
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};
