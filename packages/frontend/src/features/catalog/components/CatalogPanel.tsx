import { CatalogType } from '@lightdash/common';
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
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogMetadata } from './CatalogMetadata';
import { CatalogTree } from './CatalogTree';

type Props = {
    projectUuid: string;
};

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

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
        },
        [setSearch],
    );

    // TODO: should this transform be in the backend?
    const catalogTree = useMemo(() => {
        if (catalogResults) {
            return catalogResults.reduce<{
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
                if (table && table.type === CatalogType.Table)
                    getMetadata(tableName);
                else console.warn('Metadata not available for fields');
            }
        },
        [catalogResults, getMetadata],
    );

    const history = useHistory();
    // Keyboard navigation
    useHotkeys(
        [
            [
                'ArrowDown',
                () => {
                    //FIXME fix bug when multiple "fields" have the same name in search and you can't move
                    if (selection) {
                        //TODO move around grouped items
                        //TODO also, this sort could go somewhere else
                        const sortedGroupTables = Object.keys(
                            catalogTree[selection.group].tables,
                        ).sort(([a], [b]) => a.localeCompare(b));

                        const selectedIndex = sortedGroupTables.findIndex(
                            (name) => name === selection.table,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < sortedGroupTables.length
                        ) {
                            selectAndGetMetadata(
                                sortedGroupTables[selectedIndex + 1],
                                selection.group,
                            );
                        }
                    } else
                        selectAndGetMetadata(
                            catalogTree[Object.keys(catalogTree)[0]].tables[0]
                                .name,
                            Object.keys(catalogTree)[0],
                        );
                },
            ],
            [
                'ArrowUp',
                () => {
                    if (selection) {
                        //TODO move around grouped items
                        const sortedGroupTables = Object.keys(
                            catalogTree[selection.group].tables,
                        ).sort(([a], [b]) => a.localeCompare(b));

                        const selectedIndex = sortedGroupTables.findIndex(
                            (name) => name === selection.table,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < sortedGroupTables.length
                        ) {
                            selectAndGetMetadata(
                                sortedGroupTables[selectedIndex - 1],
                                selection.group,
                            );
                        }
                    } else
                        selectAndGetMetadata(
                            catalogTree[Object.keys(catalogTree)[0]].tables[0]
                                .name,
                            Object.keys(catalogTree)[0],
                        );
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
                            data={metadata}
                            projectUuid={projectUuid}
                        />
                    )}
                </Stack>
            )}
        </Group>
    );
};
