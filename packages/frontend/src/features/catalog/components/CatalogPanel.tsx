import { CatalogType, type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Flex,
    Group,
    SegmentedControl,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProject } from '../../../hooks/useProject';
import { useCatalog } from '../hooks/useCatalog';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogGroup } from './CatalogGroup';
import { CatalogListItem } from './CatalogListItem';
import { CatalogMetadata } from './CatalogMetadata';

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

    const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);
    const [selectedTable, setSelectedTable] = useState<string>('');
    const { mutate: getMetadata, data: metadata } =
        useCatalogMetadata(projectUuid);

    const [catalogGroupMap, ungroupedCatalogItems] = useMemo(() => {
        if (catalogResults) {
            return catalogResults.reduce<
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
        }
        return [{}, []];
    }, [catalogResults]);

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
        },
        [setSearch],
    );

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
                    {Object.keys(catalogGroupMap)
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
                                                        setSelectedTable(
                                                            item.name,
                                                        );
                                                        getMetadata(item.name);
                                                    }}
                                                    catalogItem={item}
                                                    searchString={
                                                        debouncedSearch
                                                    }
                                                    isSelected={
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
                            {ungroupedCatalogItems
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((item, idx) => (
                                    <CatalogListItem
                                        key={`${item.name}-${idx}`}
                                        catalogItem={item}
                                        searchString={debouncedSearch}
                                        tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                        isSelected={item.name === selectedTable}
                                        onClick={() => {
                                            setSelectedTable(item.name);
                                            getMetadata(item.name);
                                        }}
                                    />
                                ))}
                        </tbody>
                    </Table>
                </Stack>
            </Stack>
            <Stack>
                <Button onClick={() => setIsMetadataOpen((prev) => !prev)}>
                    Show metadata
                </Button>

                {isMetadataOpen && metadata && (
                    <CatalogMetadata data={metadata} />
                )}
            </Stack>
        </Flex>
    );
};
