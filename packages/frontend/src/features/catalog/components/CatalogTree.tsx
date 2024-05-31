import { CatalogType, type CatalogSelection } from '@lightdash/common';
import { Box, Loader, Stack, Text, Tooltip } from '@mantine/core';
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
    isLoading?: boolean;
};

type NodeProps = Omit<Props, 'tree' | 'isLoading'> & {
    node: any;
    hideGroupedTables?: boolean;
    index: number;
    length: number;
};

const renderTreeNode = ({
    node,
    projectUuid,
    onItemClick,
    selection,
    searchString,
    hideGroupedTables = false,
    index,
    length,
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
                isLast={index === length - 1}
            >
                {Object.keys(node.tables).length > 0 && (
                    <Box>
                        {Object.entries(node.tables).map(
                            ([_, value], tableIndex) =>
                                renderTreeNode({
                                    node: value,
                                    projectUuid,
                                    onItemClick,
                                    selection,
                                    searchString,
                                    index: tableIndex,
                                    length: Object.keys(node.tables).length,
                                }),
                        )}
                    </Box>
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
                isFirst={index === 0}
                isLast={index === length - 1}
            >
                {Object.keys(node.fields).length > 0 && (
                    <Stack
                        spacing={0}
                        mb="xs"
                        pl="xs"
                        sx={(theme) => ({
                            borderLeft: `1px solid ${theme.colors.gray[2]}`,
                        })}
                    >
                        {node.fields.map((child: any, fieldIndex: number) =>
                            renderTreeNode({
                                node: child,
                                projectUuid,
                                onItemClick,
                                selection,
                                searchString,
                                index: fieldIndex,
                                length: Object.keys(node.fields).length,
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
    isLoading,
    tree,
    searchString,
    projectUuid,
    selection,
    onItemClick,
}) => {
    if (!tree) {
        return null;
    }

    // If the only group is 'Ungrouped tables', hide the group label
    const hideGroupedTables =
        Object.keys(tree).length === 1 && tree['Ungrouped tables'];

    return (
        <Tooltip.Group>
            <Box
                sx={(theme) => ({
                    border: `1px solid ${theme.colors.gray[3]}`,
                    backgroundColor: theme.fn.lighten(
                        theme.colors.gray[0],
                        0.5,
                    ),
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing.lg,
                    boxShadow: `0 0 0 1px ${theme.colors.gray[0]},
                    0 2px 3px -2px ${theme.colors.gray[0]},
                    0 3px 12px -4px ${theme.colors.gray[2]},
                    0 4px 16px -8px ${theme.colors.gray[2]}`,
                })}
            >
                <Box
                    sx={{ maxHeight: '900px', overflowY: 'scroll' }}
                    key={`catalog-tree-${searchString}`}
                >
                    {isLoading ? (
                        <Stack p="lg" justify="center" align="center">
                            <Loader size="sm" variant="bars" color="dark" />
                            <Text fw={500} fz="md" c="gray.6">
                                Initializing your data catalog...
                            </Text>
                        </Stack>
                    ) : (
                        Object.entries(tree).map(([_, value], index) =>
                            renderTreeNode({
                                node: value,
                                projectUuid,
                                onItemClick,
                                selection,
                                searchString,
                                hideGroupedTables,

                                index,
                                length: Object.keys(tree).length,
                            }),
                        )
                    )}
                </Box>
            </Box>
        </Tooltip.Group>
    );
};
