import { TreeNodeInfo } from '@blueprintjs/core';
import { ProjectCatalog } from '@lightdash/common';
import { IconBinaryTree2, IconDatabase, IconTable } from '@tabler/icons-react';
import { useMemo } from 'react';
import MantineIcon from '../components/common/MantineIcon';

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
                        icon: <MantineIcon icon={IconDatabase} size="lg" />,
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
                                        <MantineIcon
                                            icon={IconBinaryTree2}
                                            size="lg"
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
                                                    <MantineIcon
                                                        icon={IconTable}
                                                        size="lg"
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
