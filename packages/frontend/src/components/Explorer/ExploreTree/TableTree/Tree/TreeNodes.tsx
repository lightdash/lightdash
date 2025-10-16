import {
    FeatureFlags,
    OrderFieldsByStrategy,
    isDimension,
    sortTimeFrames,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { memo, useMemo, useState, type FC } from 'react';
import {
    selectActiveFields,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { useFeatureFlag } from '../../../../../hooks/useFeatureFlagEnabled';
import TreeGroupNode from './TreeGroupNode';
import TreeSingleNode from './TreeSingleNode';
import { isGroupNode, type Node, type NodeMap } from './types';
import useTableTree from './useTableTree';

const sortNodes =
    (
        orderStrategy: OrderFieldsByStrategy,
        itemsMap: Record<
            string,
            Dimension | Metric | AdditionalMetric | CustomDimension
        >,
    ) =>
    (a: Node, b: Node) => {
        if (orderStrategy === OrderFieldsByStrategy.INDEX) {
            return a.index - b.index;
        }

        const itemA = itemsMap[a.key];
        const itemB = itemsMap[b.key];

        if (
            isDimension(itemA) &&
            isDimension(itemB) &&
            itemA.timeInterval &&
            itemB.timeInterval
        ) {
            return sortTimeFrames(itemA.timeInterval, itemB.timeInterval);
        } else {
            return a.label.localeCompare(b.label);
        }
    };

const INITIAL_ITEMS_SHOWN = 50; // Initial number of items to show
const LOAD_MORE_INCREMENT = 25; // Number of items to load when "Show more" is clicked

/**
 * Recursively checks if a node or any of its children are selected
 */
const hasSelectedChildren = (
    node: Node,
    activeFields: Set<string>,
): boolean => {
    // Check if this node itself is selected (for single nodes)
    if (activeFields.has(node.key)) {
        return true;
    }

    // Check if any children are selected (for group nodes)
    if (isGroupNode(node) && node.children) {
        return Object.values(node.children).some((child) =>
            hasSelectedChildren(child, activeFields),
        );
    }

    return false;
};

type TreeNodesProps = {
    nodeMap: NodeMap;
    isNested?: boolean; // True when rendering children inside a group
};

const TreeNodes: FC<TreeNodesProps> = ({ nodeMap, isNested = false }) => {
    const itemsMap = useTableTree((context) => context.itemsMap);
    const orderFieldsBy = useTableTree((context) => context.orderFieldsBy);
    const isSearching = useTableTree((context) => context.isSearching);
    const activeFields = useExplorerSelector(selectActiveFields);
    const [itemsToShow, setItemsToShow] = useState(INITIAL_ITEMS_SHOWN);

    const { data: experimentalExplorerImprovements } = useFeatureFlag(
        FeatureFlags.ExperimentalExplorerImprovements,
    );

    const sortedItems = useMemo(() => {
        return Object.values(nodeMap).sort(
            sortNodes(orderFieldsBy ?? OrderFieldsByStrategy.LABEL, itemsMap),
        );
    }, [nodeMap, orderFieldsBy, itemsMap]);

    const handleShowMore = () => {
        setItemsToShow((prev) => prev + LOAD_MORE_INCREMENT);
    };

    // During search, show all items to display all search results
    // At root level (not nested), show selected items first, then remaining items
    // In nested levels (inside groups), keep original sort order
    const visibleItems = useMemo(() => {
        // During search, don't filter or reorder - show everything
        if (isSearching) {
            return sortedItems;
        }

        // If nested inside a group, don't reorder - keep original sort
        if (isNested) {
            return sortedItems;
        }

        // ROOT LEVEL ONLY: Separate selected and unselected items while maintaining sort order
        const selectedItems: Node[] = [];
        const unselectedItems: Node[] = [];

        sortedItems.forEach((node) => {
            if (hasSelectedChildren(node, activeFields)) {
                selectedItems.push(node);
            } else {
                unselectedItems.push(node);
            }
        });

        // If all items fit within the limit, just show selected first then unselected
        if (sortedItems.length <= INITIAL_ITEMS_SHOWN) {
            return [...selectedItems, ...unselectedItems];
        }

        // Calculate how many unselected items we can show
        const remainingSlots = Math.max(0, itemsToShow - selectedItems.length);
        const visibleUnselectedItems = unselectedItems.slice(0, remainingSlots);

        // Show selected items first, then unselected items up to the limit
        return [...selectedItems, ...visibleUnselectedItems];
    }, [isSearching, isNested, sortedItems, itemsToShow, activeFields]);

    const hasMore = useMemo(() => {
        // If nested, don't show "Show more" button (groups handle their own visibility)
        if (isNested) {
            return false;
        }

        // Check if there are more items to show
        return sortedItems.length > visibleItems.length;
    }, [isNested, sortedItems, visibleItems]);

    const items = useMemo(() => {
        return experimentalExplorerImprovements?.enabled
            ? visibleItems
            : sortedItems;
    }, [experimentalExplorerImprovements, visibleItems, sortedItems]);

    return (
        <>
            {items.map((node) =>
                isGroupNode(node) ? (
                    <TreeGroupNode key={node.key} node={node} />
                ) : (
                    <TreeSingleNode key={node.key} node={node} />
                ),
            )}
            {experimentalExplorerImprovements?.enabled && hasMore && (
                <Button
                    variant="subtle"
                    mt={'xs'}
                    size="xs"
                    compact
                    onClick={handleShowMore}
                >
                    Show more
                </Button>
            )}
        </>
    );
};

const MemoizedTreeNodes = memo(TreeNodes);
MemoizedTreeNodes.displayName = 'TreeNodes';
export default MemoizedTreeNodes;
