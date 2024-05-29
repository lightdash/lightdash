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
    IconFilters,
    IconReportSearch,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCatalogContext } from '../context/CatalogProvider';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogTree } from './CatalogTree';

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
    const { data: catalogResults } = useCatalog({
        projectUuid,
        type: CatalogType.Table,
        search: debouncedSearch,
    });

    const {
        mutate: getMetadata,
        data: metadata,
        reset: closeMetadata,
    } = useCatalogMetadata(projectUuid, (data) => {
        if (data) {
            setMetadata(data);
        }

        if (!isSidebarOpen && data) {
            setSidebarOpen(true);
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

    const selectionList = useMemo(
        () => getSelectionList(catalogTree),
        [catalogTree],
    );

    const selectAndGetMetadata = useCallback(
        (selectedItem: CatalogSelection) => {
            if (!selectedItem.table) return;

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
        [setSelection, catalogResults, getMetadata, getAnalytics],
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

    return (
        <Stack>
            <Group position="apart" align="flex-start">
                <Box>
                    <Group>
                        <Paper
                            p="sm"
                            withBorder
                            radius="md"
                            sx={(theme) => ({
                                boxShadow: theme.shadows.xs,
                            })}
                        >
                            <MantineIcon size={24} icon={IconReportSearch} />
                        </Paper>

                        <Box>
                            <Title order={4}>Start exploring</Title>
                            <Text color="gray.6" fw={500}>
                                Select a table or field to start exploring.
                            </Text>
                        </Box>
                    </Group>
                </Box>
                {selection && (
                    <Button
                        variant="default"
                        size="xs"
                        onClick={() => {
                            setSidebarOpen((prev) => !prev);
                            if (metadata) {
                                closeMetadata();
                                setSelection(undefined);
                            } else if (selection === undefined)
                                selectAndGetMetadata(selectionList[0]);
                            else selectAndGetMetadata(selection);
                        }}
                    >
                        {isSidebarOpen ? 'Hide metadata' : 'Show metadata'}
                    </Button>
                )}
            </Group>

            <Group spacing="xs">
                <TextInput
                    w={'50%'}
                    icon={<MantineIcon icon={IconSearch} />}
                    rightSection={
                        search ? (
                            <ActionIcon onClick={() => setSearch('')}>
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
                    inputWrapperOrder={[
                        'label',
                        'input',
                        'description',
                        'error',
                    ]}
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                />
                <Group>
                    <Popover shadow="xs">
                        <Popover.Target>
                            <Button
                                variant="default"
                                size="sm"
                                leftIcon={<MantineIcon icon={IconFilters} />}
                            >
                                Filter
                            </Button>
                        </Popover.Target>

                        <Popover.Dropdown fz="xs">
                            <Stack spacing="sm">
                                <Text c="gray.6" fw={500}>
                                    Result type
                                </Text>
                                <Checkbox.Group>
                                    <Stack spacing="xs">
                                        <Checkbox
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

                                        <Checkbox
                                            label={
                                                <Badge
                                                    fw={500}
                                                    color="gray"
                                                    styles={{
                                                        root: {
                                                            textTransform:
                                                                'none',
                                                        },
                                                    }}
                                                >
                                                    Descriptions
                                                </Badge>
                                            }
                                        />
                                    </Stack>
                                </Checkbox.Group>

                                <Divider c="gray.1" />
                                <Stack spacing="xs">
                                    <Checkbox
                                        label={
                                            <Text fz="xs" fw={500} c="gray.7">
                                                Hide base tables
                                            </Text>
                                        }
                                    />
                                    <Checkbox
                                        label={
                                            <Text fz="xs" fw={500} c="gray.7">
                                                Hide grouped tables
                                            </Text>
                                        }
                                    />
                                </Stack>
                                <Divider c="gray.1" />

                                <Button
                                    size="xs"
                                    ml="auto"
                                    sx={(theme) => ({
                                        backgroundColor: theme.colors.gray[8],
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[9],
                                        },
                                    })}
                                >
                                    Apply
                                </Button>
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                </Group>
            </Group>

            <CatalogTree
                tree={catalogTree}
                projectUuid={projectUuid}
                searchString={debouncedSearch}
                selection={selection}
                onItemClick={selectAndGetMetadata}
            />
        </Stack>
    );
};
