import { FC } from 'react';
import TreeNodes from './TreeNodes';
import { useTableTreeContext } from './TreeProvider';

const TreeRoot: FC<React.PropsWithChildren> = () => {
    const { nodeMap } = useTableTreeContext();
    return <TreeNodes nodeMap={nodeMap} />;
};

export default TreeRoot;
