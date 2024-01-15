import {
    ResourceViewItem,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, TextInput } from '@mantine/core';
import { IconChartBar, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { useSavedCharts } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const MobileCharts: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: savedQueries = [] } =
        useSavedCharts(projectUuid);
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
        return <LoadingState title="Loading charts" />;
    }

    return (
        <Stack spacing="md" m="lg">
            <Group position="apart">
                <PageBreadcrumbs
                    items={[
                        { title: 'Home', to: '/home' },
                        { title: 'All saved charts', active: true },
                    ]}
                />
            </Group>
            <TextInput
                icon={<MantineIcon icon={IconSearch} />}
                rightSection={
                    search ? (
                        <ActionIcon onClick={() => setSearch('')}>
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
                    defaultSort: { updatedAt: SortDirection.DESC },
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
