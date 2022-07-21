import { Button } from '@blueprintjs/core';
import { DashboardBasicDetails, LightdashMode, Space } from '@lightdash/common';
import React from 'react';
import { useParams } from 'react-router-dom';
import {
    useCreateMutation,
    useDeleteMutation,
    useUpdateDashboardName,
} from '../../hooks/dashboard/useDashboard';
import { useApp } from '../../providers/AppProvider';
import ActionCardList from '../common/ActionCardList';
import DashboardForm from '../SavedDashboards/DashboardForm';
import SavedQueriesContent from '../SavedQueries/SavedQueriesContent';
import { SpacePanelWrapper, Title } from './SpacePanel.styles';

interface Props {
    space: Space;
}
export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

export const SpacePanel: React.FC<Props> = ({ space }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user, health } = useApp();
    const useDelete = useDeleteMutation();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { isLoading: isCreatingDashboard, mutate: createDashboard } =
        useCreateMutation(projectUuid);

    const savedCharts = space.queries;
    const savedDashboards: DashboardBasicDetails[] = [];

    return (
        <SpacePanelWrapper>
            <Title>{space.name}</Title>

            <ActionCardList
                title="Dashboards"
                useUpdate={useUpdateDashboardName}
                useDelete={useDelete}
                dataList={savedDashboards}
                getURL={(savedDashboard) => {
                    const { uuid } = savedDashboard;
                    return `/projects/${projectUuid}/dashboards/${uuid}/view`;
                }}
                ModalContent={DashboardForm}
                headerAction={
                    user.data?.ability?.can('manage', 'Dashboard') &&
                    !isDemo && (
                        <Button
                            text="Create dashboard"
                            loading={isCreatingDashboard}
                            onClick={() =>
                                createDashboard({
                                    name: DEFAULT_DASHBOARD_NAME,
                                    tiles: [],
                                })
                            }
                            intent="primary"
                        />
                    )
                }
            />

            <SavedQueriesContent
                savedQueries={savedCharts || []}
                projectUuid={projectUuid}
                isChart
            />
        </SpacePanelWrapper>
    );
};

export default SpacePanel;
