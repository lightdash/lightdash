import { type SummaryExplore } from '@lightdash/common';
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
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplores } from '../../../hooks/useExplores';
import { useProject } from '../../../hooks/useProject';
import { CataloGroup } from './CatalogGroup';
import { CatalogItem } from './CatalogItem';

type Props = {
    projectUuid: string;
};

export const CatalogPanel: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
}) => {
    const history = useHistory();
    const [search, setSearch] = useState<string>('');
    const { data: projectData } = useProject(projectUuid);

    const exploresResult = useExplores(projectUuid, true);

    const [exploreGroupMap, ungroupedExplores] = useMemo(() => {
        const validSearch = search ? search.toLowerCase() : '';
        if (exploresResult.data) {
            let explores = Object.values(exploresResult.data);
            if (validSearch !== '') {
                explores = new Fuse(Object.values(exploresResult.data), {
                    keys: ['label'],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }

            return explores.reduce<
                [Record<string, SummaryExplore[]>, SummaryExplore[]]
            >(
                (acc, explore) => {
                    if (explore.groupLabel) {
                        return [
                            {
                                ...acc[0],
                                [explore.groupLabel]: acc[0][explore.groupLabel]
                                    ? [...acc[0][explore.groupLabel], explore]
                                    : [explore],
                            },
                            acc[1],
                        ];
                    }
                    return [acc[0], [...acc[1], explore]];
                },
                [{}, []],
            );
        }
        return [{}, []];
    }, [exploresResult.data, search]);
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

    if (exploresResult.data) {
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

                {Object.keys(exploreGroupMap)
                    .sort((a, b) => a.localeCompare(b))
                    .map((groupLabel) => (
                        <CataloGroup label={groupLabel} key={groupLabel}>
                            <Table>
                                <tbody>
                                    {exploreGroupMap[groupLabel]
                                        .sort((a, b) =>
                                            a.label.localeCompare(b.label),
                                        )
                                        .map((explore) => (
                                            <CatalogItem
                                                key={explore.name}
                                                explore={explore}
                                                onClick={() => {
                                                    history.push(
                                                        `/projects/${projectUuid}/tables/${explore.name}`,
                                                    );
                                                }}
                                            />
                                        ))}
                                </tbody>
                            </Table>
                        </CataloGroup>
                    ))}
                <Table>
                    <tbody>
                        {ungroupedExplores
                            .sort((a, b) => a.label.localeCompare(b.label))
                            .map((explore) => (
                                <CatalogItem
                                    key={explore.name}
                                    explore={explore}
                                    onClick={() => {
                                        history.push(
                                            `/projects/${projectUuid}/tables/${explore.name}`,
                                        );
                                    }}
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
