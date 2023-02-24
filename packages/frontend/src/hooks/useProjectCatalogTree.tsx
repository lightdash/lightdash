import { Colors, TreeNodeInfo } from '@blueprintjs/core';
import { ProjectCatalog } from '@lightdash/common';
import { IconBinaryTree2, IconDatabase, IconTable } from '@tabler/icons-react';
import { useMemo } from 'react';

export type ProjectCatalogTreeNode = TreeNodeInfo<
    ProjectCatalog[number][number][number]
>;

export const useProjectCatalogTree = (
    projectCatalog: ProjectCatalog | undefined,
): ProjectCatalogTreeNode[] =>
    useMemo<ProjectCatalogTreeNode[]>(() => {
        if (projectCatalog) {
            return Object.entries(projectCatalog).reduce<
                ProjectCatalogTreeNode[]
            >(
                (accDatabases, [database, schemas], databaseIndex) => [
                    ...accDatabases,
                    {
                        id: database,
                        isExpanded: databaseIndex === 0,
                        label: database,
                        icon: (
                            <IconDatabase
                                color={Colors.GRAY1}
                                size={20}
                                style={{ marginRight: '7px' }}
                            />
                        ),
                        childNodes: Object.entries(schemas).reduce<
                            ProjectCatalogTreeNode[]
                        >(
                            (accSchemas, [schema, tables], schemaIndex) => [
                                ...accSchemas,
                                {
                                    id: schema,
                                    isExpanded: schemaIndex === 0,
                                    label: schema,
                                    icon: (
                                        <IconBinaryTree2
                                            color={Colors.GRAY1}
                                            size={20}
                                            style={{ marginRight: '7px' }}
                                        />
                                    ),
                                    childNodes: Object.entries(tables).reduce<
                                        ProjectCatalogTreeNode[]
                                    >(
                                        (accTables, [table, nodeData]) => [
                                            ...accTables,
                                            {
                                                id: table,
                                                label: table,
                                                icon: (
                                                    <IconTable
                                                        color={Colors.GRAY1}
                                                        size={20}
                                                        style={{
                                                            marginRight: '7px',
                                                        }}
                                                    />
                                                ),
                                                nodeData,
                                            },
                                        ],
                                        [],
                                    ),
                                },
                            ],
                            [],
                        ),
                    },
                ],
                [],
            );
        }
        return [];
    }, [projectCatalog]);
