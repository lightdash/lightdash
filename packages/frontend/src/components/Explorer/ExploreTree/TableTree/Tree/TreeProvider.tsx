import { type FC } from 'react';
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
    const nodeMap = getNodeMapFromItemsMap(
        itemsMap,
        selectedItems,
        groupDetails,
    );
    const searchResults = getSearchResults(itemsMap, searchQuery);
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
