import {
    OrderFieldsByStrategy,
    isDimension,
    sortTimeFrames,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
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

const TreeNodes: FC<{ nodeMap: NodeMap }> = ({ nodeMap }) => {
    const itemsMap = useTableTree((context) => context.itemsMap);
    const orderFieldsBy = useTableTree((context) => context.orderFieldsBy);
    const sortedItems = useMemo(() => {
        return Object.values(nodeMap).sort(
            sortNodes(orderFieldsBy ?? OrderFieldsByStrategy.LABEL, itemsMap),
        );
    }, [nodeMap, orderFieldsBy, itemsMap]);

    return (
        <>
            {sortedItems.map((node) =>
                isGroupNode(node) ? (
                    <TreeGroupNode key={node.key} node={node} />
                ) : (
                    <TreeSingleNode key={node.key} node={node} />
                ),
            )}
        </>
    );
};

const MemoizedTreeNodes = memo(TreeNodes);
MemoizedTreeNodes.displayName = 'TreeNodes';
export default MemoizedTreeNodes;
