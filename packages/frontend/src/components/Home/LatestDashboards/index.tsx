import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import {
    useCreateMutation,
    useDeleteMutation,
    useUpdateDashboardName,
} from '../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import ActionCardList from '../../common/ActionCardList';
import DashboardForm from '../../SavedDashboards/DashboardForm';
import LatestCard from '../LatestCard';
import { ViewAllDashboardsButton } from './LatestDashboard.styles';
interface Props {
    projectUuid: string;
}

const LatestDashboards: FC<Props> = ({ projectUuid }) => {
    const dashboardsRequest = useDashboards(projectUuid);
    const dashboards = dashboardsRequest.data || [];
    const useDelete = useDeleteMutation();
    const {
        isLoading: isCreatingDashboard,
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
    } = useCreateMutation(projectUuid);

    if (hasCreatedDashboard && newDashboard) {
        return (
            <Redirect
                push
                to={`/projects/${projectUuid}/dashboards/${newDashboard.uuid}`}
            />
        );
    }

    const featuredDashboards = dashboards
        .sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        )
        .slice(0, 6);

    return (
        <LatestCard
            isLoading={dashboardsRequest.isLoading}
            title="Last updated dashboards"
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
            <ActionCardList
                title=""
                useUpdate={useUpdateDashboardName}
                useDelete={useDelete}
                dataList={featuredDashboards}
                getURL={(savedDashboard) => {
                    const { uuid } = savedDashboard;
                    return `/projects/${projectUuid}/dashboards/${uuid}/view`;
                }}
                ModalContent={DashboardForm}
                isHomePage
            />
        </LatestCard>
    );
};

export default LatestDashboards;
