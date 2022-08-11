import {
    AdditionalMetric,
    Dimension,
    isDimension,
    Metric,
    TimeInterval,
} from '@lightdash/common';
import React, { FC } from 'react';
import TreeGroupNode from './TreeGroupNode';
import {
    isGroupNode,
    Node,
    NodeMap,
    useTableTreeContext,
} from './TreeProvider';
import TreeSingleNode from './TreeSingleNode';

const timeIntervalSort = [
    undefined,
    'RAW',
    TimeInterval.DAY,
    TimeInterval.WEEK,
    TimeInterval.MONTH,
    TimeInterval.YEAR,
];

const sortNodes =
    (itemsMap: Record<string, Dimension | Metric | AdditionalMetric>) =>
    (a: Node, b: Node) => {
        const itemA = itemsMap[a.key];
        const itemB = itemsMap[b.key];

        let order;
        if (a.children && !b.children) {
            order = -1;
        } else if (!a.children && b.children) {
            order = 1;
        } else if (
            isDimension(itemA) &&
            isDimension(itemB) &&
            itemA.timeInterval &&
            itemB.timeInterval
        ) {
            return (
                timeIntervalSort.indexOf(itemA.timeInterval) -
                timeIntervalSort.indexOf(itemB.timeInterval)
            );
        } else {
            order = a.label.localeCompare(b.label);
        }
        return order;
    };

const TreeNodes: FC<{ nodeMap: NodeMap; depth: number }> = ({
    nodeMap,
    depth,
}) => {
    const { itemsMap } = useTableTreeContext();
    return (
        <div>
            {Object.values(nodeMap)
                .sort(sortNodes(itemsMap))
                .map((node) =>
                    isGroupNode(node) ? (
                        <TreeGroupNode
                            key={node.key}
                            node={node}
                            depth={depth}
                        />
                    ) : (
                        <TreeSingleNode
                            key={node.key}
                            node={node}
                            depth={depth}
                        />
                    ),
                )}
        </div>
    );
};

export default TreeNodes;
