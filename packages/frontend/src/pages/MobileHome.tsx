import { Stack, Title } from '@mantine/core';
import { FC, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import PageSpinner from '../components/PageSpinner';

import {
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
} from '@lightdash/common';
import { IconLayoutDashboard } from '@tabler/icons-react';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useProjectSavedChartStatus } from '../hooks/useOnboardingStatus';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';

const MobileHome: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const savedChartStatus = useProjectSavedChartStatus(selectedProjectUuid);
    const project = useProject(selectedProjectUuid);
    const pinnedItems = usePinnedItems(
        selectedProjectUuid,
        project.data?.pinnedListUuid,
    );

    const {
        data: mostPopularAndRecentlyUpdated,
        isInitialLoading: isMostPopularAndRecentlyUpdatedLoading,
    } = useMostPopularAndRecentlyUpdated(selectedProjectUuid);

    const { user } = useApp();
    const items = useMemo(() => {
        const mostPopularItems =
            mostPopularAndRecentlyUpdated?.mostPopular.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.MOST_POPULAR,
            })) ?? [];
        const pinnedItemsWithCategory =
            pinnedItems.data?.map((item) => ({
                ...item,
                category: ResourceItemCategory.PINNED,
            })) ?? [];

        return [...pinnedItemsWithCategory, ...mostPopularItems];
    }, [mostPopularAndRecentlyUpdated, pinnedItems]);

    const isLoading =
        project.isInitialLoading ||
        savedChartStatus.isInitialLoading ||
        isMostPopularAndRecentlyUpdatedLoading ||
        pinnedItems.isInitialLoading;
    const error = project.error || savedChartStatus.error;

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return <PageSpinner />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!project.data) {
        return <ErrorState />;
    }

    return (
        <Stack spacing="md" m="lg">
            <Stack justify="flex-start" spacing="xs">
                <Title order={3}>
                    {`Welcome${
                        user.data?.firstName
                            ? ', ' + user.data?.firstName
                            : ' to Lightdash'
                    }!`}{' '}
                    ⚡️
                </Title>
            </Stack>
            <ResourceView
                items={items}
                tabs={
                    pinnedItems.data && pinnedItems.data.length > 0
                        ? [
                              {
                                  id: 'pinned',
                                  name: 'Pinned',
                                  filter: (item) =>
                                      'category' in item &&
                                      item.category ===
                                          ResourceItemCategory.PINNED,
                              },
                              {
                                  id: 'most-popular',
                                  name: 'Most popular',
                                  filter: (item) =>
                                      'category' in item &&
                                      item.category ===
                                          ResourceItemCategory.MOST_POPULAR,
                              },
                          ]
                        : undefined
                }
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

export default MobileHome;
