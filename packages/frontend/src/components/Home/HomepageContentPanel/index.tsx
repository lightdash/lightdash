import {
    LightdashMode,
    contentToResourceViewItem,
    ResourceItemCategory,
    ResourceViewItemType,
    wrapResource,
    type MostPopularAndRecentlyUpdated,
    type ResourceViewItem,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useVerifiedContentForHomepage } from '../../../hooks/useVerifiedContentList';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import ResourceView from '../../common/ResourceView';

interface Props {
    data: MostPopularAndRecentlyUpdated | undefined;
    projectUuid: string;
    projectUrlIdentifier: string;
}

export const HomepageContentPanel: FC<Props> = ({
    data,
    projectUuid,
    projectUrlIdentifier,
}) => {
    const { t } = useTranslation('home');
    const authoringEnabled = useContentAuthoringEnabled();
    const MAX_NUMBER_OF_ITEMS_IN_PANEL = 10;
    const navigate = useNavigate();
    const { health } = useApp();

    const { data: verifiedContentData } =
        useVerifiedContentForHomepage(projectUuid);

    const allItems = useMemo(() => {
        const mostPopularItems =
            data?.mostPopular.map((item) => ({
                ...('contentType' in item
                    ? contentToResourceViewItem(item)
                    : wrapResource(
                          item,
                          'chartType' in item
                              ? ResourceViewItemType.CHART
                              : ResourceViewItemType.DASHBOARD,
                      )),
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
        void navigate(`/projects/${projectUrlIdentifier}/tables`);
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
                    name: t('contentPanel.mostPopular'),
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.MOST_POPULAR,
                },
                {
                    id: 'recently-updated',
                    name: t('contentPanel.recentlyUpdated'),
                    filter: (item) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.RECENTLY_UPDATED,
                },
                {
                    id: 'verified',
                    name: t('contentPanel.verified'),
                    filter: (item: ResourceViewItem) =>
                        'category' in item &&
                        item.category === ResourceItemCategory.VERIFIED,
                    emptyStateProps: {
                        title: t('contentPanel.noVerifiedContent'),
                        description: undefined,
                        action: undefined,
                    },
                },
            ]}
            listProps={{
                enableSorting: false,
                defaultColumnVisibility: { space: false },
            }}
            headerProps={
                allItems.length === 0
                    ? {
                          title: t('contentPanel.chartsAndDashboards'),
                          action: (
                              <MantineLinkButton
                                  size="compact-sm"
                                  variant="subtle"
                                  target="_blank"
                                  href="https://docs.lightdash.com/get-started/exploring-data/intro"
                              >
                                  {t('contentPanel.learn')}
                              </MantineLinkButton>
                          ),
                      }
                    : undefined
            }
            emptyStateProps={{
                icon: <MantineIcon icon={IconChartBar} size={30} />,
                title: userCanCreateCharts
                    ? t('contentPanel.emptyTitle')
                    : t('contentPanel.noItems'),
                description: userCanCreateCharts
                    ? t('contentPanel.emptyDescription')
                    : undefined,
                action:
                    !isDemo && userCanCreateCharts ? (
                        <Button
                            display={authoringEnabled ? undefined : 'none'}
                            leftSection={
                                <MantineIcon icon={IconPlus} size={18} />
                            }
                            onClick={handleCreateChart}
                        >
                            {t('contentPanel.createChart')}
                        </Button>
                    ) : undefined,
            }}
        />
    );
};
