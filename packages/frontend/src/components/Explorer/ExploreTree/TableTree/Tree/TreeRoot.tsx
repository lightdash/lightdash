import { type FC } from 'react';
import TreeNodes from './TreeNodes';
import useTableTree from './useTableTree';

const TreeRoot: FC = () => {
    const nodeMap = useTableTree((context) => context.nodeMap);
    return <TreeNodes nodeMap={nodeMap} />;
};

export default TreeRoot;
