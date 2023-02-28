import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { IconChartBar, IconEye, IconStar } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceView from '../../common/ResourceView';
import {
    isResourceViewSpaceItem,
    ResourceViewItemType,
    wrapResourceView,
} from '../../common/ResourceView/resourceTypeUtils';

interface Props {
    projectUuid: string;
}

const RecentlyUpdatedPanel: FC<Props> = ({ projectUuid }) => {
    const history = useHistory();
    const { user, health } = useApp();
    const { data: dashboards = [], isLoading: isDashboardsLoading } =
        useDashboards(projectUuid);
    const { data: savedCharts = [], isLoading: isChartsLoading } =
        useSavedCharts(projectUuid);

    const recentItems = useMemo(() => {
        return [
            ...wrapResourceView(dashboards, ResourceViewItemType.DASHBOARD),
            ...wrapResourceView(savedCharts, ResourceViewItemType.CHART),
        ];
    }, [dashboards, savedCharts]);

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    if (isDashboardsLoading || isChartsLoading) {
        return null;
    }

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
                              <AnchorButton
                                  text="Learn"
                                  minimal
                                  target="_blank"
                                  href="https://docs.lightdash.com/get-started/exploring-data/intro"
                              />
                          ),
                      }
                    : undefined
            }
            emptyStateProps={{
                icon: <IconChartBar size={30} />,
                title: 'Feels a little bit empty over here...',
                description: 'get started by creating some charts',
                action:
                    !isDemo && userCanManageCharts ? (
                        <Button
                            icon="plus"
                            intent="primary"
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
