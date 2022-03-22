import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { DEFAULT_DASHBOARD_NAME } from '../../../pages/SavedDashboards';
import LatestCard from '../LatestCard';
import {
    CreateDashboardButton,
    DashboardLinkButton,
    DashboardsWrapper,
    DashboardTitle,
    ViewAllDashboardsButton,
} from './LatestDashboard.styles';

interface Props {
    projectUuid: string;
}

const LatestDashboards: FC<Props> = ({ projectUuid }) => {
    const dashboardsRequest = useDashboards(projectUuid);
    const dashboards = dashboardsRequest.data || [];
    const createDashboard = useCreateMutation(projectUuid);

    if (createDashboard.isSuccess && createDashboard.data) {
        return (
            <Redirect
                push
                to={`/projects/${projectUuid}/dashboards/${createDashboard.data.uuid}`}
            />
        );
    }

    return (
        <LatestCard
            isLoading={dashboardsRequest.isLoading}
            title="Browse dashboards"
            headerAction={
                dashboards.length > 0 ? (
                    <ViewAllDashboardsButton
                        text={`View all ${dashboards.length}`}
                        minimal
                        outlined
                        href={`/projects/${projectUuid}/dashboards`}
                    />
                ) : (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        outlined
                        href="https://docs.lightdash.com/get-started/exploring-data/dashboards/"
                        style={{ width: 100 }}
                    />
                )
            }
        >
            <DashboardsWrapper>
                {dashboards
                    .sort(
                        (a, b) =>
                            new Date(b.updatedAt).getTime() -
                            new Date(a.updatedAt).getTime(),
                    )
                    .slice(0, 6)
                    .map(({ uuid, name }) => (
                        <DashboardLinkButton
                            key={uuid}
                            minimal
                            outlined
                            href={`/projects/${projectUuid}/dashboards/${uuid}`}
                        >
                            <DashboardTitle>{name}</DashboardTitle>
                        </DashboardLinkButton>
                    ))}
                {dashboards.length < 6 && (
                    <CreateDashboardButton
                        minimal
                        loading={createDashboard.isLoading}
                        intent="primary"
                        onClick={() =>
                            createDashboard.mutate({
                                name: DEFAULT_DASHBOARD_NAME,
                                tiles: [],
                            })
                        }
                    >
                        + Create a dashboard
                    </CreateDashboardButton>
                )}
            </DashboardsWrapper>
        </LatestCard>
    );
};

export default LatestDashboards;
