import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { IconClock, IconEye, IconStar } from '@tabler/icons-react';
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
import {
    ResourceEmptyStateHeader,
    ResourceEmptyStateHeaderWrapper,
    ResourceEmptyStateIcon,
    ResourceEmptyStateText,
} from '../../common/ResourceView/ResourceView.styles';
import { SortDirection } from '../../common/ResourceView/ResourceViewList';

interface Props {
    projectUuid: string;
}

const RecentlyUpdatedPanel: FC<Props> = ({ projectUuid }) => {
    const history = useHistory();
    const { user, health } = useApp();
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const recentItems = useMemo(() => {
        return [
            ...wrapResourceView(dashboards, ResourceViewItemType.DASHBOARD),
            ...wrapResourceView(savedCharts, ResourceViewItemType.CHART),
        ]
            .sort((a, b) => {
                if (isResourceViewSpaceItem(a) || isResourceViewSpaceItem(b)) {
                    return 0;
                }

                return (
                    new Date(b.data.updatedAt).getTime() -
                    new Date(a.data.updatedAt).getTime()
                );
            })
            .slice(0, 10);
    }, [dashboards, savedCharts]);

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
            enableSorting={false}
            defaultSort={{ updatedAt: SortDirection.DESC }}
            defaultColumnVisibility={{ space: false, type: false }}
            showCount={false}
            headerTitle="Recently updated"
            tabs={[
                {
                    id: 'recently-updated',
                    name: 'Recently updated',
                    icon: <IconClock size={15} stroke={1.5} />,
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
                    icon: <IconStar size={15} stroke={1.5} />,
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
            headerAction={
                recentItems.length === 0 && (
                    <AnchorButton
                        text="Learn"
                        minimal
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/exploring-data/intro"
                    />
                )
            }
            renderEmptyState={() => (
                <>
                    <ResourceEmptyStateIcon icon="chart" size={40} />

                    <ResourceEmptyStateHeaderWrapper>
                        <ResourceEmptyStateHeader>
                            Feels a little bit empty over here...
                        </ResourceEmptyStateHeader>

                        <ResourceEmptyStateText>
                            get started by creating some charts
                        </ResourceEmptyStateText>
                    </ResourceEmptyStateHeaderWrapper>

                    {!isDemo && userCanManageCharts && (
                        <Button
                            icon="plus"
                            intent="primary"
                            onClick={handleCreateChart}
                        >
                            Create chart
                        </Button>
                    )}
                </>
            )}
        />
    );
};

export default RecentlyUpdatedPanel;
