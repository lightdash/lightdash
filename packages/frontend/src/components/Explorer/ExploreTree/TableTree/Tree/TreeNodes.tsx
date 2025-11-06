import { OrderFieldsByStrategy } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { sortNodes } from './sortNodes';
import TreeGroupNode from './TreeGroupNode';
import TreeSingleNode from './TreeSingleNode';
import { isGroupNode, type NodeMap } from './types';
import useTableTree from './useTableTree';

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
