import {
    CatalogType,
    type CatalogField,
    type CatalogTable,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProject } from '../../../hooks/useProject';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogMetadata } from './CatalogMetadata';
import { CatalogTree } from './CatalogTree';

type Props = {
    projectUuid: string;
};

type CatalogTreeType = {
    [key: string]: {
        name: string;
        tables: {
            [key: string]: CatalogTable & { fields: CatalogField[] };
        };
    };
};

function sortTree(tree: CatalogTreeType): CatalogTreeType {
    const sortedTree: CatalogTreeType = {};

    const sortedKeys = Object.keys(tree).sort((a, b) => a.localeCompare(b));

    sortedKeys.forEach((key) => {
        const value = tree[key];

        const sortedTables: typeof value.tables = {};
        const sortedTableKeys = Object.keys(value.tables).sort((a, b) =>
            a.localeCompare(b),
        );

        sortedTableKeys.forEach((tableKey) => {
            const tableValue = value.tables[tableKey];
            sortedTables[tableKey] = {
                ...tableValue,
                fields: tableValue.fields.sort((a, b) => {
                    return a.name.localeCompare(b.name);
                }),
            };
        });

        // Assign the sorted tables to the sorted tree
        sortedTree[key] = {
            ...value,
            tables: sortedTables,
        };
    });

    return sortedTree;
}

export const CatalogPanel: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
}) => {
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data: projectData } = useProject(projectUuid);

    const { data: catalogResults } = useCatalog({
        projectUuid,
        type: CatalogType.Table,
        search: debouncedSearch,
    });

    // TODO: add field
    const [selection, setSelection] = useState<{
        group: string;
        table: string;
    }>();

    const {
        mutate: getMetadata,
        data: metadata,
        reset: closeMetadata,
    } = useCatalogMetadata(projectUuid);
    const {
        mutate: getAnalytics,
        isLoading: isAnalyticsLoading,
        data: analytics,
    } = useCatalogAnalytics(projectUuid);

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
        },
        [setSearch],
    );

    // TODO: should this transform be in the backend?
    const catalogTree: CatalogTreeType = useMemo(() => {
        if (catalogResults) {
            const unsortedTree = catalogResults.reduce<{
                [key: string]: any;
            }>((acc, item) => {
                if (item.type === CatalogType.Table) {
                    const groupName =
                        'groupLabel' in item && item.groupLabel
                            ? item.groupLabel
                            : 'Ungrouped tables';
                    if (!acc[groupName]) {
                        acc[groupName] = { name: groupName, tables: {} };
                    }
                    acc[groupName].tables[item.name] = {
                        ...item,
                        groupName: groupName,
                        fields: [],
                    };
                } else if (item.type === CatalogType.Field) {
                    const groupName =
                        'tableGroupLabel' in item && item.tableGroupLabel
                            ? item.tableGroupLabel
                            : 'Ungrouped tables';
                    if (!acc[groupName]) {
                        acc[groupName] = { name: groupName, tables: {} };
                    }
                    if (!acc[groupName].tables[item.tableName]) {
                        acc[groupName].tables[item.tableName] = {
                            name: item.tableName,
                            type: CatalogType.Table,
                            fields: [],
                        };
                    }
                    acc[groupName].tables[item.tableName].fields.push(item);
                }
                return acc;
            }, {});

            return sortTree(unsortedTree);
        }
        return {};
    }, [catalogResults]);

    const selectAndGetMetadata = useCallback(
        (tableName: string, groupName: string) => {
            // For optimization purposes, we could only make this request if metadata panel is open
            setSelection({ table: tableName, group: groupName });

            if (catalogResults) {
                const table = catalogResults.find(
                    (item) => item.name === tableName,
                );
                if (table && table.type === CatalogType.Table) {
                    getMetadata(tableName);
                    getAnalytics(tableName);
                } else console.warn('Metadata not available for fields');
            }
        },
        [catalogResults, getMetadata, getAnalytics],
    );

    const history = useHistory();
    // Keyboard navigation
    useHotkeys(
        [
            [
                'ArrowDown',
                () => {
                    if (selection) {
                        //TODO move around grouped items
                        const treeKeys = Object.keys(
                            catalogTree[selection.group].tables,
                        );

                        const selectedIndex = treeKeys.findIndex(
                            (name) => name === selection.table,
                        );

                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < treeKeys.length
                        ) {
                            selectAndGetMetadata(
                                treeKeys[(selectedIndex + 1) % treeKeys.length],
                                selection.group,
                            );
                        }
                    } else {
                        // Get the first table in the first group
                        selectAndGetMetadata(
                            Object.entries(
                                Object.entries(catalogTree)[0][1].tables,
                            )[0][1].name,
                            Object.keys(catalogTree)[0],
                        );
                    }
                },
            ],
            [
                'ArrowUp',
                () => {
                    if (selection) {
                        //TODO move around grouped items
                        const treeKeys = Object.keys(
                            catalogTree[selection.group].tables,
                        );

                        const selectedIndex = treeKeys.findIndex(
                            (name) => name === selection.table,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < treeKeys.length
                        ) {
                            selectAndGetMetadata(
                                treeKeys[
                                    (selectedIndex - 1 + treeKeys.length) %
                                        treeKeys.length
                                ],
                                selection.group,
                            );
                        }
                    } else {
                        // Get the first table in the first group
                        selectAndGetMetadata(
                            Object.entries(
                                Object.entries(catalogTree)[0][1].tables,
                            )[0][1].name,
                            Object.keys(catalogTree)[0],
                        );
                    }
                },
            ],
            [
                'Enter',
                () => {
                    if (catalogResults) {
                        const selectedItem = catalogResults.find(
                            (item) => item.name === selection?.table,
                        );
                        if (
                            selectedItem &&
                            selectedItem.type === CatalogType.Table
                        )
                            history.push(
                                `/projects/${projectUuid}/tables/${selectedItem.name}`,
                            );
                        else console.warn('Explore not available for fields');
                    }
                },
            ],
        ],
        [],
    );

    return (
        <Group noWrap align="start">
            <Stack w={selection ? '70%' : '100%'}>
                <Box>
                    <Title order={4} mt="xxl">
                        {projectData?.name}
                    </Title>
                    <Text color="gray">
                        Select a table or field to start exploring.
                    </Text>
                </Box>
                <Group position="apart">
                    <TextInput
                        w={'40%'}
                        icon={<MantineIcon icon={IconSearch} />}
                        rightSection={
                            search ? (
                                <ActionIcon onClick={() => setSearch('')}>
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search tables"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />{' '}
                    <Group>
                        <SegmentedControl
                            w={200}
                            disabled // TODO: remove when implemented
                            defaultValue={'tables'}
                            data={[
                                {
                                    value: 'tables',
                                    label: 'Tables',
                                },
                                {
                                    value: 'fields',
                                    label: 'Fields',
                                },
                            ]}
                            onChange={() => {
                                // NYI
                            }}
                        />
                        <Button
                            variant="default"
                            disabled // TODO: remove when implemented
                            leftIcon={<MantineIcon icon={IconFilter} />}
                        >
                            Filters
                        </Button>
                    </Group>
                </Group>
                <Stack sx={{ maxHeight: '900px', overflow: 'scroll' }}>
                    <CatalogTree
                        tree={catalogTree}
                        projectUuid={projectUuid}
                        searchString={debouncedSearch}
                        selection={selection}
                        onTableClick={selectAndGetMetadata}
                    />
                </Stack>
            </Stack>
            {selection && (
                <Stack w="30%">
                    <Button
                        onClick={() => {
                            if (metadata) {
                                closeMetadata();
                                setSelection(undefined);
                            } else if (selection === undefined)
                                selectAndGetMetadata(
                                    catalogTree[Object.keys(catalogTree)[0]]
                                        .tables[0].name,
                                    catalogTree[Object.keys(catalogTree)[0]]
                                        .name,
                                );
                            else
                                selectAndGetMetadata(
                                    selection.table,
                                    selection.group,
                                );
                        }}
                    >
                        {metadata ? 'Hide metadata' : 'Show metadata'}
                    </Button>

                    {metadata && (
                        <CatalogMetadata
                            metadataResults={metadata}
                            projectUuid={projectUuid}
                            analyticResults={analytics}
                            isAnalyticsLoading={isAnalyticsLoading}
                        />
                    )}
                </Stack>
            )}
        </Group>
    );
};
