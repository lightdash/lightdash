import { type ProjectCatalog } from '@lightdash/common';
import { IconBinaryTree2, IconDatabase, IconTable } from '@tabler/icons-react';
import { useMemo } from 'react';
import MantineIcon from '../components/common/MantineIcon';

export type ProjectCatalogTreeNode = {
    id: string;
    isExpanded: boolean;
    icon: React.ReactNode;
    label: string;
    description?: string;
    sqlTable?: string;
    childNodes?: ProjectCatalogTreeNode[];
};

export const useProjectCatalogTree = (
    projectCatalog: ProjectCatalog | undefined,
): ProjectCatalogTreeNode[] =>
    useMemo<ProjectCatalogTreeNode[]>(() => {
        if (!projectCatalog) return [];

        return Object.entries(projectCatalog).reduce<ProjectCatalogTreeNode[]>(
            (accDatabases, [database, schemas], databaseIndex) => [
                ...accDatabases,
                {
                    id: database,
                    isExpanded: databaseIndex === 0,
                    label: database,
                    icon: (
                        <MantineIcon
                            icon={IconDatabase}
                            size="lg"
                            color="gray.7"
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
                                    <MantineIcon
                                        icon={IconBinaryTree2}
                                        size="lg"
                                        color="gray.7"
                                    />
                                ),
                                childNodes: Object.entries(tables).reduce<
                                    ProjectCatalogTreeNode[]
                                >(
                                    (accTables, [table, nodeData]) => [
                                        ...accTables,
                                        {
                                            id: table,
                                            isExpanded: false,
                                            label: table,
                                            description: nodeData.description,
                                            sqlTable: nodeData.sqlTable,
                                            icon: (
                                                <MantineIcon
                                                    icon={IconTable}
                                                    size="lg"
                                                    color="gray.7"
                                                />
                                            ),
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
    }, [projectCatalog]);
