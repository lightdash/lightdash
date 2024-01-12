import { NavLink } from '@mantine/core';
import { FC } from 'react';

import { ProjectCatalogTreeNode } from '../../../hooks/useProjectCatalogTree';

type Props = {
    nodes: ProjectCatalogTreeNode[];
    onSelect: (node: ProjectCatalogTreeNode) => void;
};

const CatalogTree: FC<Props> = ({ nodes, onSelect }) => {
    return (
        <>
            {nodes.map((node) => (
                <NavLink
                    key={node.id}
                    defaultOpened={node.isExpanded}
                    label={node.label}
                    description={node.description}
                    icon={node.icon}
                    onClick={node.sqlTable ? () => onSelect(node) : undefined}
                >
                    {node.childNodes ? (
                        <CatalogTree
                            nodes={node.childNodes}
                            onSelect={onSelect}
                        />
                    ) : undefined}
                </NavLink>
            ))}
        </>
    );
};

export default CatalogTree;
