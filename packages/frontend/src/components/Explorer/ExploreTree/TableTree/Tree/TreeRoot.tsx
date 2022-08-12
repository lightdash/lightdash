import React, { FC } from 'react';
import TreeNodes from './TreeNodes';
import { useTableTreeContext } from './TreeProvider';

const TreeRoot: FC<{ depth?: number }> = ({ depth }) => {
    const { nodeMap } = useTableTreeContext();
    return <TreeNodes nodeMap={nodeMap} depth={depth || 0} />;
};

export default TreeRoot;
