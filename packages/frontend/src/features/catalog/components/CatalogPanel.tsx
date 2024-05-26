import { CatalogType, type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Flex,
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

    const [selectedTable, setSelectedTable] = useState<string>();
    const {
        mutate: getMetadata,
        data: metadata,
        reset: closeMetadata,
    } = useCatalogMetadata(projectUuid);

    const [catalogGroupMap, ungroupedCatalogItems] = useMemo(() => {
        if (catalogResults) {
            const results = catalogResults.reduce<
                [Record<string, CatalogItem[]>, CatalogItem[]]
            >(
                (acc, item) => {
                    if ('groupLabel' in item && item.groupLabel) {
                        return [
                            {
                                ...acc[0],
                                [item.groupLabel]: acc[0][item.groupLabel]
                                    ? [...acc[0][item.groupLabel], item]
                                    : [item],
                            },
                            acc[1],
                        ];
                    }
                    return [acc[0], [...acc[1], item]];
                },
                [{}, []],
            );
            return [
                results[0],
                results[1].sort((a, b) => a.name.localeCompare(b.name)),
            ];
        }
        return [{}, []];
    }, [catalogResults]);

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
        },
        [setSearch],
    );

    console.log({ catalogResults, catalogGroupMap, ungroupedCatalogItems });

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
                    acc[groupName].tables[item.name] = { ...item, fields: [] };
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
        (tableName: string) => {
            // For optimization purposes, we could only make this request if metadata panel is open
            setSelectedTable(tableName);

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
                    if (selectedTable) {
                        //TODO move around grouped items
                        const selectedIndex = ungroupedCatalogItems.findIndex(
                            (item) => item.name === selectedTable,
                        );
                        if (
                            selectedIndex !== undefined &&
                            selectedIndex < ungroupedCatalogItems.length
                        ) {
                            selectAndGetMetadata(
                                ungroupedCatalogItems[selectedIndex + 1].name,
                            );
                        }
                    } else selectAndGetMetadata(ungroupedCatalogItems[0]?.name);
                },
            ],
            [
                'ArrowUp',
                () => {
                    if (selectedTable) {
                        //TODO move around grouped items
                        const selectedIndex = ungroupedCatalogItems.findIndex(
                            (item) => item.name === selectedTable,
                        );
                        if (selectedIndex !== undefined && selectedIndex > 0)
                            selectAndGetMetadata(
                                ungroupedCatalogItems[selectedIndex - 1].name,
                            );
                    } else selectAndGetMetadata(ungroupedCatalogItems[0]?.name);
                },
            ],
            [
                'Enter',
                () => {
                    if (catalogResults) {
                        const selectedItem = catalogResults.find(
                            (item) => item.name === selectedTable,
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

    // console.log('catalogTree -> ', { catalogResults, catalogTree });

    return (
        <Flex>
            <Stack>
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
                    {/* {Object.keys(catalogGroupMap)
                        .sort((a, b) => a.localeCompare(b))
                        .map((groupLabel, idx) => (
                            <CatalogGroup label={groupLabel} key={groupLabel}>
                                <Table>
                                    <tbody>
                                        {catalogGroupMap[groupLabel]
                                            .sort((a, b) =>
                                                a.name.localeCompare(b.name),
                                            )
                                            .map((item) => (
                                                <CatalogListItem
                                                    key={`${item.name}-${idx}`}
                                                    onClick={() => {
                                                        selectAndGetMetadata(
                                                            item.name,
                                                        );
                                                    }}
                                                    catalogItem={item}
                                                    searchString={
                                                        debouncedSearch
                                                    }
                                                    isSelected={
                                                        metadata !==
                                                            undefined &&
                                                        item.name ===
                                                            selectedTable
                                                    }
                                                    tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                                />
                                            ))}
                                    </tbody>
                                </Table>
                            </CatalogGroup>
                        ))}

                    <Table h="100%">
                        <tbody>
                            {ungroupedCatalogItems.map((item, idx) => (
                                <CatalogListItem
                                    key={`${item.name}-${idx}`}
                                    catalogItem={item}
                                    searchString={debouncedSearch}
                                    tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                    isSelected={
                                        metadata !== undefined &&
                                        item.name === selectedTable
                                    }
                                    onClick={() => {
                                        selectAndGetMetadata(item.name);
                                    }}
                                />
                            ))}
                        </tbody>
                    </Table> */}
                    <CatalogTree
                        tree={catalogTree}
                        projectUuid={projectUuid}
                        searchString={debouncedSearch}
                    />
                </Stack>
            </Stack>
            <Stack>
                <Button
                    onClick={() => {
                        if (metadata) closeMetadata();
                        else if (selectedTable === undefined)
                            selectAndGetMetadata(
                                ungroupedCatalogItems[0]?.name,
                            );
                        else selectAndGetMetadata(selectedTable);
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
        </Flex>
    );
};
