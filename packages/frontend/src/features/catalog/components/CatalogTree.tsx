import { CatalogType, type CatalogSelection } from '@lightdash/common';
import { Stack, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { CatalogFieldListItem } from './CatalogFieldListItem';
import { CatalogGroup } from './CatalogGroup';
import { CatalogTableListItem } from './CatalogTableListItem';

type Props = {
    tree: any;
    projectUuid: string;
    onItemClick: (item: CatalogSelection) => void;
    selection?: CatalogSelection;
    searchString?: string;
};

type NodeProps = Omit<Props, 'tree'> & {
    node: any;
    hideGroupedTables?: boolean;
};

const renderTreeNode = ({
    node,
    projectUuid,
    onItemClick,
    selection,
    searchString,
    hideGroupedTables = false,
}: NodeProps) => {
    if (!node) {
        return null;
    }

    if (!node.type) {
        return (
            <CatalogGroup
                label={node.name}
                key={node.name + `${selection?.group === node.name}`}
                startOpen={
                    node.name === 'Ungrouped tables' ||
                    selection?.group === node.name
                }
                tableCount={Object.keys(node.tables).length}
                hidden={hideGroupedTables && node.name === 'Ungrouped tables'}
            >
                {Object.keys(node.tables).length > 0 && (
                    <Stack spacing={3}>
                        {Object.entries(node.tables).map(([_, value]) =>
                            renderTreeNode({
                                node: value,
                                projectUuid,
                                onItemClick,
                                selection,
                                searchString,
                            }),
                        )}
                    </Stack>
                )}
            </CatalogGroup>
        );
    } else if (node.type === CatalogType.Table) {
        return (
            <CatalogTableListItem
                key={node.name}
                table={node}
                startOpen={node.fields.length > 0}
                searchString={searchString}
                onClick={() =>
                    onItemClick({
                        table: node.name,
                        group: node.groupName,
                    })
                }
                isSelected={selection?.table === node.name && !selection?.field}
                url={`/projects/${projectUuid}/tables/${node.name}`}
            >
                {Object.keys(node.fields).length > 0 && (
                    <Stack spacing={0}>
                        {node.fields.map((child: any) =>
                            renderTreeNode({
                                node: child,
                                projectUuid,
                                onItemClick,
                                selection,
                                searchString,
                            }),
                        )}
                    </Stack>
                )}
            </CatalogTableListItem>
        );
    } else if (node.type === CatalogType.Field) {
        return (
            <CatalogFieldListItem
                key={node.tableName + node.name}
                field={node}
                searchString={searchString}
                isSelected={
                    selection?.field === node.name &&
                    selection?.table === node.tableName
                }
                onClick={() =>
                    onItemClick({
                        table: node.tableName,
                        group: node.groupName,
                        field: node.name,
                    })
                }
            />
        );
    }
    return null;
};

export const CatalogTree: FC<React.PropsWithChildren<Props>> = ({
    tree,
    searchString,
    projectUuid,
    selection,
    onItemClick,
}) => {
    if (!tree) {
        return null;
    }

    const hideGroupedTables =
        Object.keys(tree).length === 1 && tree['Ungrouped tables'];

    return (
        <Tooltip.Group>
            <Stack
                sx={{ maxHeight: '900px', overflow: 'scroll' }}
                spacing="xs"
                key={`catalog-tree-${searchString}`}
            >
                {Object.entries(tree).map(([_, value]) =>
                    renderTreeNode({
                        node: value,
                        projectUuid,
                        onItemClick,
                        selection,
                        searchString,
                        hideGroupedTables,
                    }),
                )}
            </Stack>
        </Tooltip.Group>
    );
};
