import { useMemo, type FC } from 'react';
import TreeContext from './TreeContext';
import { type TreeProviderProps } from './types';
import { getNodeMapFromItemsMap, getSearchResults } from './utils';

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
        () => getNodeMapFromItemsMap(itemsMap, selectedItems, groupDetails),
        [itemsMap, selectedItems, groupDetails],
    );
    const searchResults = useMemo(
        () => getSearchResults(itemsMap, searchQuery),
        [itemsMap, searchQuery],
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
                searchResults,
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
