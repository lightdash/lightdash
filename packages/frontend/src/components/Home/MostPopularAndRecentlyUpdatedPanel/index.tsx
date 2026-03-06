import {
    FeatureFlags,
    LightdashMode,
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
    type MostPopularAndRecentlyUpdated,
    type ResourceViewItem,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useNavigate } from 'react-router';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useVerifiedContentForHomepage } from '../../../hooks/useVerifiedContentList';
import useApp from '../../../providers/App/useApp';
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
    const navigate = useNavigate();
    const { health } = useApp();

    const { data: contentVerificationFlag } = useServerFeatureFlag(
        FeatureFlags.ContentVerification,
    );
    const isContentVerificationEnabled =
        contentVerificationFlag?.enabled ?? false;

    const { data: verifiedContentData } = useVerifiedContentForHomepage(
        isContentVerificationEnabled ? projectUuid : undefined,
    );

    const allItems = useMemo(() => {
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
        const verifiedItems =
            verifiedContentData?.map((item) => ({
                ...wrapResource(
                    item,
                    'chartType' in item
                        ? ResourceViewItemType.CHART
                        : ResourceViewItemType.DASHBOARD,
                ),
                category: ResourceItemCategory.VERIFIED,
            })) ?? [];
        return [...mostPopularItems, ...recentlyUpdatedItems, ...verifiedItems];
    }, [data?.mostPopular, data?.recentlyUpdated, verifiedContentData]);

    const handleCreateChart = () => {
        void navigate(`/projects/${projectUuid}/tables`);
    };

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    return (
        <ResourceView
            items={allItems}
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
                ...(isContentVerificationEnabled
                    ? [
                          {
                              id: 'verified',
                              name: 'Verified',
                              filter: (item: ResourceViewItem) =>
                                  'category' in item &&
                                  (
                                      item as ResourceViewItem & {
                                          category: ResourceItemCategory;
                                      }
                                  ).category === ResourceItemCategory.VERIFIED,
                          },
                      ]
                    : []),
            ]}
            listProps={{
                enableSorting: false,
                defaultColumnVisibility: { space: false },
            }}
            headerProps={
                allItems.length === 0
                    ? {
                          title: 'Charts and Dashboards',
                          action: (
                              <MantineLinkButton
                                  color="ldGray.6"
                                  size="compact-sm"
                                  variant="subtle"
                                  target="_blank"
                                  href="https://docs.lightdash.com/get-started/exploring-data/intro"
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
                            leftSection={
                                <MantineIcon icon={IconPlus} size={18} />
                            }
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    ) : undefined,
            }}
        />
    );
};
