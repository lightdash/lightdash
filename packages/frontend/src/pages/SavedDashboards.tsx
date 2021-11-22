import { Button, NonIdealState, Spinner } from '@blueprintjs/core';
import React from 'react';
import { Redirect, useParams } from 'react-router-dom';
import styled from 'styled-components';
import ActionCardList from '../components/common/ActionCardList';
import DashboardForm from '../components/SavedDashboards/DashboardForm';
import {
    useCreateMutation,
    useDeleteMutation,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import { useDashboards } from '../hooks/dashboard/useDashboards';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

const SavedDashboardsWrapper = styled.div`
    width: 100%;
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const SavedDashboards = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data: dashboards = [] } = useDashboards(projectUuid);
    const useDelete = useDeleteMutation();
    const {
        isLoading: isCreatingDashboard,
        isSuccess: hasCreatedDashboard,
        mutate: createDashboard,
        data: newDashboard,
    } = useCreateMutation(projectUuid);

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading dashboards" icon={<Spinner />} />
            </div>
        );
    }

    if (hasCreatedDashboard && newDashboard) {
        return (
            <Redirect
                push
                to={`/projects/${projectUuid}/dashboards/${newDashboard.uuid}`}
            />
        );
    }

    return (
        <SavedDashboardsWrapper>
            <ActionCardList
                title="Dashboards"
                useUpdate={useUpdateDashboard}
                useDelete={useDelete}
                dataList={dashboards}
                getURL={(savedDashboard) => {
                    const { uuid } = savedDashboard;
                    return `/projects/${projectUuid}/dashboards/${uuid}/view`;
                }}
                ModalContent={DashboardForm}
                headerAction={
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
                }
            />
        </SavedDashboardsWrapper>
    );
};

export default SavedDashboards;
