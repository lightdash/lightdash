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
import { CatalogGroup } from './CatalogGroup';
import { CatalogListItem } from './CatalogListItem';

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

    const handleSearchChange = useCallback(
        (searchString: string) => {
            setSearch(searchString);
        },
        [setSearch],
    );

    // TODO: should this transform be in the backend?
    // This could be more efficient. It does two passes on the data at the moment:
    // one to group tables and fields, and another to group tables by groupLabel
    const catalogTree = useMemo(() => {
        if (catalogResults) {
            const tablesWithFields = catalogResults.reduce<{
                [key: string]:
                    | (CatalogTable & { fields: CatalogField[] })
                    | { fields: CatalogField[]; type: CatalogType };
            }>((acc, item) => {
                if (item.type === CatalogType.Table) {
                    if (!acc[item.name]) {
                        acc[item.name] = { ...item, fields: [] };
                    } else {
                        acc[item.name] = {
                            ...acc[item.name],
                            ...item,
                        };
                    }
                } else if (item.type === CatalogType.Field) {
                    if (acc[item.tableLabel]) {
                        acc[item.tableLabel].fields.push(item);
                    } else {
                        acc[item.tableLabel] = {
                            fields: [item],
                            type: CatalogType.Table,
                        };
                    }
                }
                return acc;
            }, {});
            const groupsWithTables = Object.keys(tablesWithFields).reduce<{
                [key: string]: Array<
                    | (CatalogTable & { fields: CatalogField[] })
                    | {
                          name: string;
                          fields: CatalogField[];
                          type: CatalogType;
                      }
                >;
            }>((acc, tableName) => {
                const table = tablesWithFields[tableName];

                // TODO: fields whose table is not returned need the grouping data from the BE
                // Without it, fields whose table is not returned will be grouped under 'Ungrouped tables'
                const groupLabel =
                    'groupLabel' in table && table.groupLabel
                        ? table.groupLabel
                        : 'Ungrouped tables';

                if (acc[groupLabel]) {
                    acc[groupLabel] = [
                        ...acc[groupLabel],
                        { name: tableName, ...table },
                    ];
                } else {
                    acc[groupLabel] = [{ name: tableName, ...table }];
                }
                return acc;
            }, {});
            return groupsWithTables;
        }
        return {};
    }, [catalogResults]);

    /*
    if (exploresResult.status === 'loading') {
        return <LoadingSkeleton />;
    }

    if (exploresResult.status === 'error') {
        return (
            <SuboptimalState
                icon={IconAlertCircle}
                title="Could not load explores"
            />
        );
    }*/

    return (
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
                {catalogTree &&
                    Object.keys(catalogTree)
                        .sort((a, b) => a.localeCompare(b))
                        .map((groupLabel, idx) => (
                            <CatalogGroup label={groupLabel} key={groupLabel}>
                                <Table>
                                    <tbody>
                                        {catalogTree[groupLabel]
                                            .sort((a, b) =>
                                                a.name.localeCompare(b.name),
                                            )
                                            .map((item) => (
                                                <CatalogListItem
                                                    key={`${item.name}-${idx}`}
                                                    catalogItem={item}
                                                    searchString={
                                                        debouncedSearch
                                                    }
                                                    tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                                />
                                            ))}
                                    </tbody>
                                </Table>
                            </CatalogGroup>
                        ))}
            </Stack>
        </Stack>
    );
};
