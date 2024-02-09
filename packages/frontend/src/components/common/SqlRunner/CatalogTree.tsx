import { ActionIcon, Group, NavLink, Popover, Text } from '@mantine/core';
import { FC } from 'react';

import { useHover } from '@mantine/hooks';
import { IconInfoCircle, IconTableShortcut } from '@tabler/icons-react';
import { ProjectCatalogTreeNode } from '../../../hooks/useProjectCatalogTree';
import MantineIcon from '../MantineIcon';

type Props = {
    nodes: ProjectCatalogTreeNode[];
    onSelect: (node: ProjectCatalogTreeNode) => void;
    onTablePreviewClick: (sqlTable: string) => void;
};

type ItemProps = {
    node: Props['nodes'][number];
    onSelect: (node: ProjectCatalogTreeNode) => void;
    onTablePreviewClick: (sqlTable: string) => void;
};

const CatalogTree: FC<Props> = ({ nodes, onSelect, onTablePreviewClick }) => {
    return (
        <>
            {nodes.map((node) => (
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                <CatalogItem
                    node={node}
                    onSelect={onSelect}
                    key={node.id}
                    onTablePreviewClick={onTablePreviewClick}
                />
            ))}
        </>
    );
};

const CatalogItem: FC<ItemProps> = ({
    node,
    onSelect,
    onTablePreviewClick,
}) => {
    const { ref, hovered } = useHover();
    const { sqlTable } = node;
    return (
        <NavLink
            component="div"
            ref={ref}
            defaultOpened={node.isExpanded}
            label={node.label}
            description={''}
            icon={node.icon}
            onClick={node.sqlTable ? () => onSelect(node) : undefined}
            rightSection={
                sqlTable !== undefined ? (
                    <Group spacing={'sm'}>
                        <Popover width={200} position="right" withArrow>
                            <Popover.Target>
                                <ActionIcon
                                    sx={{
                                        visibility: hovered
                                            ? 'visible'
                                            : 'hidden',
                                    }}
                                    size={'xs'}
                                    variant={'subtle'}
                                    color={'gray.9'}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                >
                                    <MantineIcon icon={IconInfoCircle} />
                                </ActionIcon>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Text size={'sm'}>{node.description}</Text>
                            </Popover.Dropdown>
                        </Popover>

                        <ActionIcon
                            sx={{
                                visibility: hovered ? 'visible' : 'hidden',
                            }}
                            size={'xs'}
                            variant={'subtle'}
                            color={'gray.9'}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTablePreviewClick(sqlTable);
                            }}
                        >
                            <MantineIcon icon={IconTableShortcut} />
                        </ActionIcon>
                    </Group>
                ) : undefined
            }
        >
            {node.childNodes ? (
                <CatalogTree
                    nodes={node.childNodes}
                    onSelect={onSelect}
                    onTablePreviewClick={onTablePreviewClick}
                />
            ) : undefined}
        </NavLink>
    );
};

export default CatalogTree;
