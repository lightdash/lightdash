import {
    ResourceViewItemType,
    wrapResourceView,
    type ResourceViewItem,
} from '@lightdash/common';
import { TextInput, Group, Stack, ActionIcon } from '@mantine-8/core';
import { IconChartBar, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { ResourceSortDirection } from '../components/common/ResourceView/types';
import { useCharts } from '../hooks/useCharts';
import useApp from '../providers/App/useApp';

const MobileCharts: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: savedQueries = [] } =
        useCharts(projectUuid);
    const { user } = useApp();
    const cannotView = user.data?.ability?.cannot('view', 'SavedChart');
    const [search, setSearch] = useState<string>('');
    const visibleItems = useMemo(() => {
        const items = wrapResourceView(
            savedQueries,
            ResourceViewItemType.CHART,
        );
        if (search && search !== '') {
            const matchingItems: ResourceViewItem[] = [];
            new Fuse(items, {
                keys: ['data.name'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .forEach((res) => matchingItems.push(res.item));
            return matchingItems;
        }
        return items;
    }, [savedQueries, search]);

    if (isInitialLoading && !cannotView) {
        return <EmptyStateLoader my="xl" title="Loading charts" />;
    }

    return (
        <Stack gap="md" m="lg">
            <Group justify="space-between">
                <PageBreadcrumbs
                    items={[
                        { title: 'Home', to: '/home' },
                        { title: 'All saved charts', active: true },
                    ]}
                />
            </Group>
            <TextInput
                leftSection={<MantineIcon icon={IconSearch} />}
                rightSectionPointerEvents="all"
                rightSection={
                    search ? (
                        <ActionIcon
                            aria-label="Clear search"
                            onMouseDown={(event) => event.preventDefault()}
                            variant="subtle"
                            color="gray"
                            onClick={() => setSearch('')}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            <ResourceView
                items={visibleItems}
                listProps={{
                    defaultSort: { updatedAt: ResourceSortDirection.DESC },
                    defaultColumnVisibility: {
                        space: false,
                        updatedAt: false,
                        actions: false,
                    },
                }}
                emptyStateProps={{
                    icon: <IconChartBar size={30} />,
                    title: 'No charts added yet',
                }}
            />
        </Stack>
    );
};

export default MobileCharts;
