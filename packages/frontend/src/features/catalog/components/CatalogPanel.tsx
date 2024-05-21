import { CatalogType, type CatalogItem } from '@lightdash/common';
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
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
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
    const { data: projectData } = useProject(projectUuid);

    const { data: catalogResults } = useCatalog({
        projectUuid,
        type: CatalogType.Field,
    });

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

    if (catalogResults) {
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
                        onChange={(e) => setSearch(e.target.value)}
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

                {Object.keys(catalogGroupMap)
                    .sort((a, b) => a.localeCompare(b))
                    .map((groupLabel) => (
                        <CatalogGroup label={groupLabel} key={groupLabel}>
                            <Table>
                                <tbody>
                                    {catalogGroupMap[groupLabel]
                                        .sort((a, b) =>
                                            a.name.localeCompare(b.name),
                                        )
                                        .map((item) => (
                                            <CatalogListItem
                                                key={item.name}
                                                catalogItem={item}
                                                searchString={search}
                                                tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                            />
                                        ))}
                                </tbody>
                            </Table>
                        </CatalogGroup>
                    ))}
                <Table>
                    <tbody>
                        {ungroupedCatalogItems
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((item) => (
                                <CatalogListItem
                                    key={item.name}
                                    catalogItem={item}
                                    searchString={search}
                                    tableUrl={`/projects/${projectUuid}/tables/${item.name}`}
                                />
                            ))}
                    </tbody>
                </Table>
            </Stack>
        );
    }
    return null;
    /*
    return (
        <SuboptimalState
            icon={IconAlertTriangle}
            title="Could not load explores"
        />
    );*/
};
