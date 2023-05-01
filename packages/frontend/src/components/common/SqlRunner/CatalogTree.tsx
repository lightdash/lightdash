import React from 'react';

import { Box, NavLink } from '@mantine/core';
import { ProjectCatalogTreeNode } from '../../../hooks/useProjectCatalogTree';

type Props = {
    nodes: ProjectCatalogTreeNode[];
    onSelect: (node: ProjectCatalogTreeNode) => void;
};

const CatalogTree: React.FC<Props> = ({ nodes, onSelect }) => {
    return (
        <Box>
            {nodes.map((node) => (
                <React.Fragment key={node.id}>
                    <NavLink
                        defaultOpened={node.isExpanded}
                        label={node.label}
                        description={node.description}
                        icon={node.icon}
                        onClick={
                            node.sqlTable ? () => onSelect(node) : undefined
                        }
                    >
                        {node.childNodes ? (
                            <CatalogTree
                                nodes={node.childNodes}
                                onSelect={onSelect}
                            />
                        ) : undefined}
                    </NavLink>
                </React.Fragment>
            ))}
        </Box>
    );
};

export default CatalogTree;
