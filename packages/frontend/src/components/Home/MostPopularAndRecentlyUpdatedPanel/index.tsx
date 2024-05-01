import {
    LightdashMode,
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
    type MostPopularAndRecentlyUpdated,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import ResourceView from '../../common/ResourceView';

interface Props {
    data: MostPopularAndRecentlyUpdated | undefined;
    projectUuid: string;
}

export const MostPopularAndRecentlyUpdatedPanel: FC<Props> = ({
    data,
    projectUuid,
}) => {
    const MAX_NUMBER_OF_ITEMS_IN_PANEL = 10;
    const history = useHistory();
    const { health } = useApp();

    const mostPopularAndRecentlyUpdatedItems = useMemo(() => {
        const mostPopularItems =
            data?.mostPopular.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.MOST_POPULAR,
            })) ?? [];
        const recentlyUpdatedItems =
            data?.recentlyUpdated.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.RECENTLY_UPDATED,
            })) ?? [];
        return [...mostPopularItems, ...recentlyUpdatedItems];
    }, [data?.mostPopular, data?.recentlyUpdated]);

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    return (
        <ResourceView
            items={mostPopularAndRecentlyUpdatedItems}
            maxItems={MAX_NUMBER_OF_ITEMS_IN_PANEL}
            tabs={[
                {
                    id: 'most-popular',
                    name: 'Most popular',
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.MOST_POPULAR,
                },
                {
                    id: 'recently-updated',
                    name: 'Recently updated',
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.RECENTLY_UPDATED,
                },
            ]}
            listProps={{
                enableSorting: false,
                defaultColumnVisibility: { space: false },
            }}
            headerProps={
                mostPopularAndRecentlyUpdatedItems.length === 0
                    ? {
                          title: 'Charts and Dashboards',
                          action: (
                              <MantineLinkButton
                                  color="gray.6"
                                  compact
                                  variant="subtle"
                                  target="_blank"
                                  href={`${health.data?.siteHelpdeskUrl}/get-started/exploring-data/intro`}
                              >
                                  Learn
                              </MantineLinkButton>
                          ),
                      }
                    : undefined
            }
            emptyStateProps={{
                icon: <MantineIcon icon={IconChartBar} size={30} />,
                title: userCanCreateCharts
                    ? 'Feels a little bit empty over here'
                    : 'No items added yet',
                description: userCanCreateCharts
                    ? 'get started by creating some charts'
                    : undefined,
                action:
                    !isDemo && userCanCreateCharts ? (
                        <Button
                            leftIcon={<MantineIcon icon={IconPlus} size={18} />}
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    ) : undefined,
            }}
        />
    );
};
