import { AnchorButton, Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import ResourceList from '../../common/ResourceList';
import {
    ResourceEmptyStateHeader,
    ResourceEmptyStateHeaderWrapper,
    ResourceEmptyStateIcon,
    ResourceEmptyStateText,
} from '../../common/ResourceList/ResourceList.styles';
import { SortDirection } from '../../common/ResourceList/ResourceTable';

interface Props {
    projectUuid: string;
}

const RecentlyUpdatedPanel: FC<Props> = ({ projectUuid }) => {
    const history = useHistory();
    const { user, health } = useApp();
    const { data: dashboards = [] } = useDashboards(projectUuid);
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const recentItems = useMemo(() => {
        return [...dashboards, ...savedCharts]
            .sort((a, b) => {
                return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
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
        <ResourceList
            data={recentItems}
            enableSorting={false}
            defaultSort={{ updatedAt: SortDirection.DESC }}
            defaultColumnVisibility={{ space: false }}
            showCount={false}
            headerTitle="Recently updated"
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
