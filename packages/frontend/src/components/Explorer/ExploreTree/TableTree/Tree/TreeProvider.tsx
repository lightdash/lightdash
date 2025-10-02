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
    orderFieldsBy,
    isGithubIntegrationEnabled,
    gitIntegration,
    onItemClick,
    searchResults,
}) => {
    const nodeMap = useMemo(
        () => getNodeMapFromItemsMap(itemsMap, groupDetails),
        [itemsMap, groupDetails],
    );
    const isSearching = !!searchQuery && searchQuery !== '';

    const contextValue = useMemo(
        () => ({
            itemsMap,
            nodeMap,
            selectedItems,
            isSearching,
            searchQuery,
            missingCustomMetrics,
            itemsAlerts,
            missingCustomDimensions,
            orderFieldsBy,
            isGithubIntegrationEnabled,
            gitIntegration,
            onItemClick,
            searchResults,
        }),
        [
            itemsMap,
            nodeMap,
            selectedItems,
            isSearching,
            searchQuery,
            missingCustomMetrics,
            itemsAlerts,
            missingCustomDimensions,
            orderFieldsBy,
            isGithubIntegrationEnabled,
            gitIntegration,
            onItemClick,
            searchResults,
        ],
    );

    return (
        <TreeContext.Provider value={contextValue}>
            {children}
        </TreeContext.Provider>
    );
};
