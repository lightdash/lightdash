import { memo, useMemo, type FC } from 'react';
import TreeContext from '../Tree/TreeContext';
import TreeGroupNode from '../Tree/TreeGroupNode';
import TreeSingleNode from '../Tree/TreeSingleNode';
import { isGroupNode } from '../Tree/types';
import { TreeSection, type SectionContext, type TreeNodeItem } from './types';

interface VirtualTreeNodeProps {
    item: TreeNodeItem;
    sectionContexts: Map<string, SectionContext>;
    onToggleGroup: (groupKey: string) => void;
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
}

/**
 * Renders a tree node (single or group) in the virtualized tree
 * Wraps TreeSingleNode or TreeGroupNode with the necessary context
 */
const VirtualTreeNodeComponent: FC<VirtualTreeNodeProps> = ({
    item,
    sectionContexts,
    onToggleGroup,
    onSelectedFieldChange,
}) => {
    const { node, isGroup, sectionKey, depth } = item.data;

    // Look up the shared section context
    const sectionContext = sectionContexts.get(sectionKey);

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
            nodeMap: sectionContext.nodeMap,
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
                    // Determine if it's a dimension based on section type
                    const isDimension =
                        sectionContext.sectionType === TreeSection.Dimensions ||
                        sectionContext.sectionType ===
                            TreeSection.CustomDimensions;
                    onSelectedFieldChange(key, isDimension);
                }
            },
            searchResults: sectionContext.searchResults,
            tableName: sectionContext.tableName,
            treeSectionType: sectionContext.sectionType,
            expandedGroups: new Set<string>(), // Not needed - expansion state is in flattened data
            onToggleGroup,
            isVirtualized: true, // Flag to prevent inline children rendering
            depth, // Nesting depth for indentation
        };
    }, [sectionContext, depth, onSelectedFieldChange, onToggleGroup]);

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
