import {
    ResourceViewItem,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, TextInput } from '@mantine/core';
import { IconLayoutDashboard, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useSpace } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const MobileSpace: FC = () => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const {
        data: space,
        isInitialLoading,
        error,
    } = useSpace(projectUuid, spaceUuid);
    const { user } = useApp();
    const [search, setSearch] = useState<string>('');
    const visibleItems = useMemo(() => {
        const dashboardsInSpace = space?.dashboards || [];
        const chartsInSpace = space?.queries || [];
        const allItems = [
            ...wrapResourceView(
                dashboardsInSpace,
                ResourceViewItemType.DASHBOARD,
            ),
            ...wrapResourceView(chartsInSpace, ResourceViewItemType.CHART),
        ];
        if (search && search !== '') {
            const matchingItems: ResourceViewItem[] = [];
            new Fuse(allItems, {
                keys: ['data.name'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .forEach((res) => matchingItems.push(res.item));
            return matchingItems;
        }
        return allItems;
    }, [space, search]);

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading) {
        return <LoadingState title="Loading space" />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (space === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Space does not exist"
                    description={`We could not find space with uuid ${spaceUuid}`}
                />
            </div>
        );
    }

    return (
        <Stack spacing="md" m="lg">
            <Group position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Spaces',
                            to: `/projects/${projectUuid}/spaces`,
                        },
                        {
                            title: space.name,
                            active: true,
                        },
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
                    icon: <IconLayoutDashboard size={30} />,
                    title: 'No items added yet',
                }}
            />
        </Stack>
    );
};

export default MobileSpace;
