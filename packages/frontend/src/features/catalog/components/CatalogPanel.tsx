import {
    CatalogType,
    type CatalogField,
    type CatalogFilter,
    type CatalogSelection,
    type CatalogTable,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';

import {
    IconReportSearch,
    IconSearch,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, useTransition, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import LinkButton from '../../../components/common/LinkButton';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useCatalogContext } from '../context/CatalogProvider';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogFilterSearch } from './CatalogFilterSearch';
import { CatalogTree } from './CatalogTree';

const TABLES_WITH_ERRORS_GROUP_NAME = 'Tables with errors';

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

        sortedTree[key] = {
            ...value,
            tables: sortedTables,
        };
    });

    return sortedTree;
}

// TODO: this could become a linked list if we need the performance
function getSelectionList(tree: CatalogTreeType): CatalogSelection[] {
    const selectionList: CatalogSelection[] = [];

    Object.keys(tree).forEach((group) => {
        Object.keys(tree[group].tables).forEach((table) => {
            selectionList.push({
                table,
                group,
            });
            tree[group].tables[table].fields.forEach((field) => {
                selectionList.push({
                    table,
                    group,
                    field: field.name,
                });
            });
        });
    });

    return selectionList;
}

export const CatalogPanel: FC = () => {
    const [, startTransition] = useTransition();
    const {
        setMetadata,
        isSidebarOpen,
        setAnalyticsResults,
        setSidebarOpen,
        projectUuid,
        // TODO: Add field
        selection,
        setSelection,
    } = useCatalogContext();

    // There are 3 search variables:
    // - search: the current search string
    // - completeSearch: the 3+ char search string that gets sent to the backend
    // - debouncedSearch: the complete search string debounced
    const [search, setSearch] = useState<string>('');
    const [completeSearch, setCompleteSearch] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(completeSearch, 300);

    const [filter, setFilter] = useState<CatalogFilter | undefined>(undefined);
    const {
        data: catalogResults,
        isFetched: catalogFetched,
        isFetching: catalogFetching,
        isLoading: catalogLoading,
    } = useCatalog({
        projectUuid,
        filter: search.length >= 3 ? filter : undefined,
        search: debouncedSearch,
    });

    const { mutate: getMetadata } = useCatalogMetadata(projectUuid, (data) => {
        if (data) {
            startTransition(() => {
                setMetadata(data);
            });
        }
    });
    const { mutate: getAnalytics } = useCatalogAnalytics(
        projectUuid,
        (data) => {
            if (data) {
                setAnalyticsResults(data);
            }
        },
    );

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
            if (searchString.length >= 3) {
                setCompleteSearch(searchString);
            } else {
                setCompleteSearch('');
            }
        },
        [setSearch],
    );

    const clearSearch = useCallback(() => {
        setSearch('');
        setCompleteSearch('');
    }, [setSearch, setCompleteSearch]);

    // TODO: should this transform be in the backend?
    const catalogTree: CatalogTreeType = useMemo(() => {
        if (catalogResults) {
            const unsortedTree = catalogResults.reduce<{
                [key: string]: any;
            }>((acc, item) => {
                if (item.type === CatalogType.Table) {
                    if (item.errors !== undefined) {
                        if (!acc[TABLES_WITH_ERRORS_GROUP_NAME]) {
                            acc[TABLES_WITH_ERRORS_GROUP_NAME] = {
                                name: TABLES_WITH_ERRORS_GROUP_NAME,
                                tables: {},
                            };
                        }
                        acc[TABLES_WITH_ERRORS_GROUP_NAME].tables[item.name] = {
                            ...item,
                            groupName: TABLES_WITH_ERRORS_GROUP_NAME,
                            fields: [],
                        };
                    } else {
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
                    }
                } else if (item.type === CatalogType.Field) {
                    const groupName =
                        'tableGroupLabel' in item && item.tableGroupLabel
                            ? item.tableGroupLabel
                            : 'Ungrouped tables';

                    // Add to the tree if not filtered out
                    if (!acc[groupName]) {
                        acc[groupName] = { name: groupName, tables: {} };
                    }
                    if (!acc[groupName].tables[item.tableName]) {
                        acc[groupName].tables[item.tableName] = {
                            name: item.tableName,
                            type: CatalogType.Table,
                            fields: [],
                            label: item.tableLabel,
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

    const selectionList = useMemo(
        () => getSelectionList(catalogTree),
        [catalogTree],
    );

    const selectAndGetMetadata = useCallback(
        (selectedItem: CatalogSelection) => {
            if (!selectedItem.table) return;

            if (selectedItem.group === TABLES_WITH_ERRORS_GROUP_NAME) {
                if (!isSidebarOpen) {
                    setSidebarOpen(true);
                }

                setSelection({
                    table: selectedItem.table,
                    group: selectedItem.group,
                });

                return; // no metadata for tables with errors
            }
            if (!isSidebarOpen) {
                setSidebarOpen(true);
            }

            // For optimization purposes, we could only make this request if metadata panel is open
            setSelection({
                table: selectedItem.table,
                group: selectedItem.group || 'Ungrouped tables',
                field: selectedItem.field,
            });

            if (catalogResults && selectedItem.table) {
                if (selectedItem.field) {
                    // Get metadata and analytics for field
                    getMetadata(selectedItem.table); // all metadata for the field is returned in the table
                    getAnalytics({
                        table: selectedItem.table,
                        field: selectedItem.field,
                    });
                } else {
                    // Get metadata and analytics for table
                    getMetadata(selectedItem.table);
                    getAnalytics({
                        table: selectedItem.table,
                        field: undefined,
                    });
                }
            }
        },
        [
            isSidebarOpen,
            setSelection,
            catalogResults,
            setSidebarOpen,
            getMetadata,
            getAnalytics,
        ],
    );

    const history = useHistory();
    // Keyboard navigation
    useHotkeys(
        [
            [
                'ArrowDown',
                () => {
                    if (selection) {
                        const selectedIndex = selectionList.findIndex(
                            (item) =>
                                item.table === selection.table &&
                                item.group === selection.group &&
                                item.field === selection.field,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < selectionList.length
                        ) {
                            selectAndGetMetadata(
                                selectionList[
                                    (selectedIndex + 1) % selectionList.length
                                ],
                            );
                        }
                    } else {
                        // Get the first table in the first group
                        selectAndGetMetadata(selectionList[0]);
                    }
                },
            ],
            [
                'ArrowUp',
                () => {
                    if (selection) {
                        const selectedIndex = selectionList.findIndex(
                            (item) =>
                                item.table === selection.table &&
                                item.group === selection.group &&
                                item.field === selection.field,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < selectionList.length
                        ) {
                            selectAndGetMetadata(
                                selectionList[
                                    (selectedIndex - 1 + selectionList.length) %
                                        selectionList.length
                                ],
                            );
                        }
                    } else {
                        selectAndGetMetadata(
                            selectionList[selectionList.length - 1],
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

    const noResults =
        !catalogFetching &&
        catalogFetched &&
        Object.keys(catalogTree).length === 0;
    const noTables = noResults && debouncedSearch.length === 0;

    return (
        <Stack spacing="xl">
            <Stack>
                <Group position="apart">
                    <Box mt="xl">
                        <Group>
                            <Paper
                                p="sm"
                                withBorder
                                radius="md"
                                sx={(theme) => ({
                                    boxShadow: theme.shadows.xs,
                                })}
                            >
                                <MantineIcon
                                    size={24}
                                    icon={IconReportSearch}
                                />
                            </Paper>

                            <Box>
                                <Title order={4}>Start exploring</Title>
                                <Text color="gray.6" fw={500}>
                                    Select a table or field to start exploring.
                                </Text>
                            </Box>
                        </Group>
                    </Box>
                    <RefreshDbtButton />
                </Group>

                <Group spacing="none" align="start">
                    <CatalogFilterSearch
                        filter={filter}
                        setFilter={setFilter}
                    />
                    <TextInput
                        w={'50%'}
                        icon={<MantineIcon icon={IconSearch} />}
                        rightSection={
                            search ? (
                                <ActionIcon
                                    onClick={() => handleSearchChange('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder="Search"
                        description={'Enter at least 3 characters to search'}
                        value={search}
                        inputWrapperOrder={[
                            'label',
                            'input',
                            'description',
                            'error',
                        ]}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        styles={(theme) => ({
                            input: {
                                borderTopRightRadius: theme.radius.md,
                                borderBottomRightRadius: theme.radius.md,
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                                border: `1px solid ${theme.colors.gray[3]}`,
                            },
                            description: {
                                visibility:
                                    search && search.length < 3
                                        ? 'visible'
                                        : 'hidden',
                            },
                        })}
                    />
                </Group>
            </Stack>

            {noResults ? (
                <Paper
                    p="xl"
                    radius="lg"
                    sx={(theme) => ({
                        backgroundColor: theme.colors.gray[1],
                        border: `1px solid ${theme.colors.gray[3]}`,
                    })}
                >
                    {noTables ? (
                        <SuboptimalState
                            icon={IconTable}
                            title="No tables found in this project"
                            description={
                                "Tables are the starting point to any data exploration in Lightdash. They come from dbt models that have been defined in your dbt project's .yml files."
                            }
                            action={
                                <LinkButton
                                    href="https://docs.lightdash.com/guides/adding-tables-to-lightdash"
                                    mt="md"
                                    target="_blank"
                                    sx={(theme) => ({
                                        color: theme.colors.gray[0],
                                        backgroundColor: theme.colors.gray[8],
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[9],
                                        },
                                    })}
                                >
                                    Learn more
                                </LinkButton>
                            }
                        />
                    ) : (
                        <SuboptimalState
                            icon={IconSearch}
                            title="No search results"
                            description={
                                'Try using different keywords or adjusting your filters.'
                            }
                            action={
                                <Button
                                    variant="default"
                                    onClick={clearSearch}
                                    mt="sm"
                                    radius="md"
                                >
                                    Clear search
                                </Button>
                            }
                        />
                    )}
                </Paper>
            ) : (
                <CatalogTree
                    isLoading={catalogLoading}
                    isSearching={catalogLoading && debouncedSearch.length > 2}
                    tree={catalogTree}
                    projectUuid={projectUuid}
                    searchString={debouncedSearch}
                    selection={selection}
                    onItemClick={selectAndGetMetadata}
                />
            )}
        </Stack>
    );
};
