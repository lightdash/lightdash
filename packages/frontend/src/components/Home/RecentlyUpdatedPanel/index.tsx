import { subject } from '@casl/ability';
import {
    DashboardBasicDetails,
    isResourceViewSpaceItem,
    LightdashMode,
    ResourceViewItemType,
    SpaceQuery,
    wrapResourceView,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';
import MantineLinkButton from '../../common/MantineLinkButton';
import ResourceView from '../../common/ResourceView';

interface Props {
    data: {
        dashboards: DashboardBasicDetails[];
        savedCharts: SpaceQuery[];
    };
    projectUuid: string;
}

const RecentlyUpdatedPanel: FC<Props> = ({ data, projectUuid }) => {
    const history = useHistory();
    const { user, health } = useApp();

    const recentItems = useMemo(() => {
        return [
            ...wrapResourceView(
                data.dashboards,
                ResourceViewItemType.DASHBOARD,
            ),
            ...wrapResourceView(data.savedCharts, ResourceViewItemType.CHART),
        ];
    }, [data]);

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanManageCharts = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <ResourceView
            items={recentItems}
            maxItems={10}
            tabs={[
                {
                    id: 'most-popular',
                    name: 'Most popular',
                    sort: (a, b) => {
                        if (
                            isResourceViewSpaceItem(a) ||
                            isResourceViewSpaceItem(b)
                        ) {
                            return 0;
                        }

                        return b.data.views - a.data.views;
                    },
                },
                {
                    id: 'recently-updated',
                    name: 'Recently updated',
                    sort: (a, b) => {
                        if (
                            isResourceViewSpaceItem(a) ||
                            isResourceViewSpaceItem(b)
                        ) {
                            return 0;
                        }

                        return (
                            new Date(b.data.updatedAt).getTime() -
                            new Date(a.data.updatedAt).getTime()
                        );
                    },
                },
            ]}
            listProps={{
                enableSorting: false,
                defaultColumnVisibility: { space: false },
            }}
            headerProps={
                recentItems.length === 0
                    ? {
                          title: 'Charts and Dashboards',
                          action: (
                              <MantineLinkButton
                                  color="gray.6"
                                  compact
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
                title: userCanManageCharts
                    ? 'Feels a little bit empty over here'
                    : 'No items added yet',
                description: userCanManageCharts
                    ? 'get started by creating some charts'
                    : undefined,
                action:
                    !isDemo && userCanManageCharts ? (
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

export default RecentlyUpdatedPanel;
