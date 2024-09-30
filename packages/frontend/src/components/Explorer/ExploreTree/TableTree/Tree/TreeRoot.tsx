import { type FC } from 'react';
import TreeNodes from './TreeNodes';
import { useTableTreeContext } from './TreeProvider';

const TreeRoot: FC = () => {
    const { nodeMap } = useTableTreeContext();
    return <TreeNodes nodeMap={nodeMap} />;
};

export default TreeRoot;
