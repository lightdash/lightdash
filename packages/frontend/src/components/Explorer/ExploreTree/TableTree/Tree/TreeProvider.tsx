import { memo, useMemo, type FC } from 'react';
import TreeContext from './TreeContext';
import { type TreeProviderProps } from './types';
import { getNodeMapFromItemsMap } from './utils';

const TreeProviderComponent: FC<React.PropsWithChildren<TreeProviderProps>> = ({
    searchQuery,
    children,
    itemsMap,
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

// TreeProvider uses normal React memo - all components now read selection state from Redux
export const TreeProvider = memo(TreeProviderComponent);
