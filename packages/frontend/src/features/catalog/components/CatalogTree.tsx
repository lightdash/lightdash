import { CatalogType } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { CatalogFieldListItem } from './CatalogFieldListItem';
import { CatalogGroup } from './CatalogGroup';
import { CatalogTableListItem } from './CatalogTableListItem';

type Props = {
    tree: any;
    projectUuid: string;
    onTableClick: (tableName: string, groupName: string) => void;
    selection?: { table: string; group: string };
    searchString?: string;
};

const renderTreeNode = (
    node: any,
    projectUuid: string,
    onTableClick: (tableName: string, groupName: string) => void,
    selection?: { table: string; group: string },

    searchString?: string,
) => {
    if (!node.type) {
        return (
            <CatalogGroup
                label={node.name}
                key={node.name}
                startOpen={node.name === 'Ungrouped tables'}
            >
                {Object.keys(node.tables).length > 0 && (
                    <Stack spacing={3}>
                        {Object.entries(node.tables)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([_, value]) =>
                                renderTreeNode(
                                    value,
                                    projectUuid,
                                    onTableClick,
                                    selection,
                                    searchString,
                                ),
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
                onClick={() => onTableClick(node.name, node.groupName)}
                isSelected={selection?.table === node.name}
                url={`/projects/${projectUuid}/tables/${node.name}`}
            >
                {Object.keys(node.fields).length > 0 && (
                    <Stack spacing={0}>
                        {node.fields.map((child: any) =>
                            renderTreeNode(
                                child,
                                projectUuid,
                                onTableClick,
                                selection,
                                searchString,
                            ),
                        )}
                    </Stack>
                )}
            </CatalogTableListItem>
        );
    } else if (node.type === CatalogType.Field) {
        return (
            <CatalogFieldListItem
                key={node.name}
                field={node}
                searchString={searchString}
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
    onTableClick,
}) => {
    if (!tree) {
        return null;
    }
    return (
        <Stack
            sx={{ maxHeight: '900px', overflow: 'scroll' }}
            spacing="xs"
            key={`catalog-tree-${searchString}`}
        >
            {Object.entries(tree)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([_, value]) =>
                    renderTreeNode(
                        value,
                        projectUuid,
                        onTableClick,
                        selection,
                        searchString,
                    ),
                )}
        </Stack>
    );
};
