import { FC } from 'react';
import TreeNodes from './TreeNodes';
import { useTableTreeContext } from './TreeProvider/useTableTreeContext';

const TreeRoot: FC = () => {
    const { nodeMap } = useTableTreeContext();
    return <TreeNodes nodeMap={nodeMap} />;
};

export default TreeRoot;
