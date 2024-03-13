import { NavLink, Text } from '@mantine/core';
import { type FC } from 'react';

import { useToggle } from '@mantine/hooks';
import { type ProjectCatalogTreeNode } from '../../../hooks/useProjectCatalogTree';
import { TableItemDetailPreview } from '../../Explorer/ExploreTree/TableTree/ItemDetailPreview';

type Props = {
    nodes: ProjectCatalogTreeNode[];
    onSelect: (node: ProjectCatalogTreeNode) => void;
};

const CatalogTreeNode: FC<{
    node: ProjectCatalogTreeNode;
    onSelect: () => void;
}> = ({ node, onSelect }) => {
    const [isHover, setIsHover] = useToggle();
    const isLeafNode = !node.childNodes || node.childNodes.length === 0;

    return (
        <NavLink
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            defaultOpened={node.isExpanded}
            label={
                /**
                 * Avoid setting up this component entirely for everything except the final
                 * leaf nodes in a tree:
                 */
                isLeafNode ? (
                    <TableItemDetailPreview
                        closePreview={() => setIsHover(false)}
                        showPreview={isHover}
                        description={node.description}
                        label={node.label}
                    >
                        <Text>{node.label}</Text>
                    </TableItemDetailPreview>
                ) : (
                    node.label
                )
            }
            icon={node.icon}
            onClick={node.sqlTable ? () => onSelect() : undefined}
        >
            {node.childNodes ? (
                // CataLogTree is defined via function and hoisted to the top, so it's safe to use it here.
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                <CatalogTree nodes={node.childNodes} onSelect={onSelect} />
            ) : undefined}
        </NavLink>
    );
};

function CatalogTree({ nodes, onSelect }: Props) {
    return (
        <>
            {nodes.map((node) => (
                <CatalogTreeNode
                    key={node.id}
                    node={node}
                    onSelect={() => onSelect(node)}
                />
            ))}
        </>
    );
}

export default CatalogTree;
