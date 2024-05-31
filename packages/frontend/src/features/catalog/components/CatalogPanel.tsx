import {
    CatalogType,
    type CatalogField,
    type CatalogSelection,
    type CatalogTable,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    Paper,
    Popover,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';

import {
    IconAdjustmentsHorizontal,
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
import { useCatalogContext } from '../context/CatalogProvider';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
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

enum FilterType {
    Dimensions = 'dimensions',
    Metrics = 'metrics',
    HideGroupedTables = 'hideGroupedTables',
}

type FilterState = {
    dimensions: boolean;
    metrics: boolean;
    hideGroupedTables: boolean;
};

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

    const {
        data: catalogResults,
        isFetched: catalogFetched,
        isFetching: catalogFetching,
    } = useCatalog({
        projectUuid,
        type: CatalogType.Table,
        search: debouncedSearch,
    });

    const [filtersOpen, setFiltersOpen] = useState(false);

    const [filters, setFilters] = useState({
        dimensions: false,
        metrics: false,
        hideGroupedTables: false,
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

    const toggleFilter = useCallback(
        (filter: FilterType) => {
            setFilters((prev: FilterState) => ({
                ...prev,
                [filter]: !prev[filter],
            }));
        },
        [setFilters],
    );

    const clearFilters = useCallback(() => {
        setFilters({
            dimensions: false,
            metrics: false,
            hideGroupedTables: false,
        });
    }, [setFilters]);

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
                        // If grouped tables are hidden, don't add them to the tree
                        if (
                            groupName !== 'Ungrouped tables' &&
                            filters.hideGroupedTables
                        ) {
                            return acc;
                        }
                        // Add to the tree if not filtered out
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
                    // Filter out dimensions and metrics if
                    // the filter for the other is active
                    if (
                        filters.dimensions &&
                        !filters.metrics &&
                        item.fieldType === 'metric'
                    ) {
                        return acc;
                    }
                    if (
                        filters.metrics &&
                        !filters.dimensions &&
                        item.fieldType === 'dimension'
                    ) {
                        return acc;
                    }
                    // Filter out ungrouped tables
                    if (
                        groupName !== 'Ungrouped tables' &&
                        filters.hideGroupedTables
                    ) {
                        {
                            return acc;
                        }
                    }
                    // Add to the tree if not filtered out
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
    }, [
        catalogResults,
        filters.dimensions,
        filters.hideGroupedTables,
        filters.metrics,
    ]);

    const selectionList = useMemo(
        () => getSelectionList(catalogTree),
        [catalogTree],
    );

    const selectAndGetMetadata = useCallback(
        (selectedItem: CatalogSelection) => {
            if (!selectedItem.table) return;
            if (selectedItem.group === TABLES_WITH_ERRORS_GROUP_NAME) {
                setSidebarOpen(false);
                setSelection(undefined);
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
            setSelection,
            catalogResults,
            isSidebarOpen,
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
        <Stack spacing="xxl">
            <Stack>
                <Group position="apart" align="flex-start">
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
                </Group>

                <Group spacing="xs">
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
                        description={
                            search && search.length < 3
                                ? 'Enter at least 3 characters to search'
                                : undefined
                        }
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
                                borderRadius: theme.radius.md,
                                border: `1px solid ${theme.colors.gray[3]}`,
                            },
                        })}
                    />
                    <Group>
                        <Popover
                            shadow="xs"
                            position="bottom-start"
                            opened={filtersOpen}
                            onClose={() => setFiltersOpen(false)}
                        >
                            <Button.Group>
                                <Popover.Target>
                                    <Button
                                        variant="default"
                                        size="xs"
                                        leftIcon={
                                            <MantineIcon
                                                icon={IconAdjustmentsHorizontal}
                                            />
                                        }
                                        onClick={() => {
                                            setFiltersOpen((prev) => !prev);
                                        }}
                                    >
                                        <Group noWrap spacing="xs">
                                            <Text>Filter</Text>
                                            {filters.dimensions && (
                                                <Badge
                                                    fw={500}
                                                    size="xs"
                                                    radius="md"
                                                    color="indigo"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Dimensions
                                                </Badge>
                                            )}
                                            {filters.metrics && (
                                                <Badge
                                                    fw={500}
                                                    size="xs"
                                                    color="orange"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Metrics
                                                </Badge>
                                            )}

                                            {filters.hideGroupedTables && (
                                                <Badge
                                                    fw={500}
                                                    size="xs"
                                                    color="gray.8"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Hide grouped tables
                                                </Badge>
                                            )}
                                        </Group>
                                    </Button>
                                </Popover.Target>
                                {(filters.dimensions ||
                                    filters.metrics ||
                                    filters.hideGroupedTables) && (
                                    <Button
                                        variant="default"
                                        size="xs"
                                        onClick={clearFilters}
                                        p="xs"
                                    >
                                        <MantineIcon
                                            color="gray"
                                            icon={IconX}
                                        />
                                    </Button>
                                )}
                            </Button.Group>

                            <Popover.Dropdown fz="xs">
                                <Stack spacing="sm">
                                    <Text c="gray.6" fw={500}>
                                        Result type
                                    </Text>
                                    <Stack spacing="xs">
                                        <Checkbox
                                            checked={filters.dimensions}
                                            onChange={() => {
                                                toggleFilter(
                                                    FilterType.Dimensions,
                                                );
                                            }}
                                            label={
                                                <Badge
                                                    fw={500}
                                                    radius="md"
                                                    color="indigo"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Dimensions
                                                </Badge>
                                            }
                                        />

                                        <Checkbox
                                            checked={filters.metrics}
                                            onChange={() => {
                                                toggleFilter(
                                                    FilterType.Metrics,
                                                );
                                            }}
                                            label={
                                                <Badge
                                                    fw={500}
                                                    color="orange"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Metrics
                                                </Badge>
                                            }
                                        />
                                    </Stack>

                                    <Divider c="gray.1" />
                                    <Stack spacing="xs">
                                        <Checkbox
                                            checked={filters.hideGroupedTables}
                                            onChange={() => {
                                                toggleFilter(
                                                    FilterType.HideGroupedTables,
                                                );
                                            }}
                                            label={
                                                <Text
                                                    fz="xs"
                                                    fw={500}
                                                    c="gray.7"
                                                >
                                                    Hide grouped tables
                                                </Text>
                                            }
                                        />
                                    </Stack>

                                    <Button
                                        size="xs"
                                        ml="auto"
                                        sx={(theme) => ({
                                            backgroundColor:
                                                theme.colors.gray[8],
                                            '&:hover': {
                                                backgroundColor:
                                                    theme.colors.gray[9],
                                            },
                                        })}
                                        onClick={() => setFiltersOpen(false)}
                                    >
                                        Close
                                    </Button>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    </Group>
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
