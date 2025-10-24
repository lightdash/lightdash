import { memo, useMemo, type FC } from 'react';
import TreeContext from '../Tree/TreeContext';
import TreeGroupNode from '../Tree/TreeGroupNode';
import TreeSingleNode from '../Tree/TreeSingleNode';
import { isGroupNode } from '../Tree/types';
import { getNodeMapFromItemsMap } from '../Tree/utils';
import { TreeSection, type SectionContext, type TreeNodeItem } from './types';

interface VirtualTreeNodeProps {
    item: TreeNodeItem;
    sectionContexts: Map<string, SectionContext>;
}

/**
 * Renders a tree node (single or group) in the virtualized tree
 * Wraps TreeSingleNode or TreeGroupNode with the necessary context
 */
const VirtualTreeNodeComponent: FC<VirtualTreeNodeProps> = ({
    item,
    sectionContexts,
}) => {
    const { node, isGroup, sectionKey, depth } = item.data;

    // Look up the shared section context
    const sectionContext = sectionContexts.get(sectionKey);

    // Create a temporary nodeMap for this specific node and its context
    const nodeMap = useMemo(() => {
        if (!sectionContext) return {};
        return getNodeMapFromItemsMap(sectionContext.itemsMap, undefined);
    }, [sectionContext]);

    // Build the context value from the section context
    const contextValue = useMemo(() => {
        if (!sectionContext) {
            return {
                itemsMap: {},
                nodeMap: {},
                isSearching: false,
                searchQuery: undefined,
                missingCustomMetrics: undefined,
                itemsAlerts: undefined,
                missingCustomDimensions: undefined,
                orderFieldsBy: undefined,
                isGithubIntegrationEnabled: false,
                gitIntegration: undefined,
                onItemClick: () => {},
                searchResults: [],
                tableName: '',
                treeSectionType: TreeSection.Dimensions,
                expandedGroups: new Set<string>(),
                onToggleGroup: () => {},
            };
        }

        return {
            itemsMap: sectionContext.itemsMap,
            nodeMap,
            isSearching:
                !!sectionContext.searchQuery &&
                sectionContext.searchQuery !== '',
            searchQuery: sectionContext.searchQuery,
            missingCustomMetrics: sectionContext.missingCustomMetrics,
            itemsAlerts: sectionContext.itemsAlerts,
            missingCustomDimensions: sectionContext.missingCustomDimensions,
            orderFieldsBy: sectionContext.orderFieldsBy,
            isGithubIntegrationEnabled:
                sectionContext.isGithubIntegrationEnabled,
            gitIntegration: sectionContext.gitIntegration,
            onItemClick: (key: string) => {
                const clickedItem = sectionContext.itemsMap[key];
                if (clickedItem) {
                    // This would need to be wired up properly in the parent
                    // For now, we'll leave it as a no-op since the actual
                    // click handler will come from the integration phase
                }
            },
            searchResults: sectionContext.searchResults,
            tableName: sectionContext.tableName,
            treeSectionType: sectionContext.sectionType,
            expandedGroups: new Set<string>(), // Will be provided by parent
            onToggleGroup: () => {}, // Will be provided by parent
            isVirtualized: true, // Flag to prevent inline children rendering
            depth, // Nesting depth for indentation
        };
    }, [sectionContext, nodeMap, depth]);

    if (!sectionContext) {
        console.error(`Section context not found for key: ${sectionKey}`);
        return null;
    }

    return (
        <TreeContext.Provider value={contextValue}>
            {isGroup && isGroupNode(node) ? (
                <TreeGroupNode node={node} />
            ) : (
                <TreeSingleNode node={node} />
            )}
        </TreeContext.Provider>
    );
};

const VirtualTreeNode = memo(VirtualTreeNodeComponent);
VirtualTreeNode.displayName = 'VirtualTreeNode';

export default VirtualTreeNode;
