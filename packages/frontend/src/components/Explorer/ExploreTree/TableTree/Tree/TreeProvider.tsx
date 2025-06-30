import { useMemo, type FC } from 'react';
import TreeContext from './TreeContext';
import { type TreeProviderProps } from './types';
import { getNodeMapFromItemsMap } from './utils';

export const TreeProvider: FC<React.PropsWithChildren<TreeProviderProps>> = ({
    searchQuery,
    children,
    itemsMap,
    selectedItems,
    missingCustomMetrics,
    itemsAlerts,
    missingCustomDimensions,
    groupDetails,
    ...rest
}) => {
    const nodeMap = useMemo(
        () => getNodeMapFromItemsMap(itemsMap, groupDetails),
        [itemsMap, groupDetails],
    );
    const isSearching = !!searchQuery && searchQuery !== '';
    return (
        <TreeContext.Provider
            value={{
                itemsMap,
                nodeMap,
                selectedItems,
                isSearching,
                searchQuery,
                missingCustomMetrics,
                itemsAlerts,
                missingCustomDimensions,
                ...rest,
            }}
        >
            {children}
        </TreeContext.Provider>
    );
};
