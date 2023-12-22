import {
    AdditionalMetric,
    CustomDimension,
    Dimension,
    isDimension,
    Metric,
    OrderFieldsByStrategy,
    sortTimeFrames,
} from '@lightdash/common';
import { FC, useMemo } from 'react';
import TreeGroupNode from './TreeGroupNode';
import {
    isGroupNode,
    Node,
    NodeMap,
    useTableTreeContext,
} from './TreeProvider';
import TreeSingleNode from './TreeSingleNode';

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

const TreeNodes: FC<React.PropsWithChildren<{ nodeMap: NodeMap }>> = ({
    nodeMap,
}) => {
    const { itemsMap, orderFieldsBy } = useTableTreeContext();
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

export default TreeNodes;
