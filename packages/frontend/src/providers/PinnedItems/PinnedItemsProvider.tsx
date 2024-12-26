import { subject } from '@casl/ability';
import React from 'react';
import { useReorder } from '../../hooks/pinning/usePinnedItems';
import useApp from '../App/useApp';
import PinnedItemsContext from './context';
import { type PinnedItemsContextType } from './types';

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

    const value: PinnedItemsContextType = {
        userCanManage,
        reorderItems,
        allowDelete: allowDelete ?? true,
    };
    return (
        <PinnedItemsContext.Provider value={value}>
            {children}
        </PinnedItemsContext.Provider>
    );
};
