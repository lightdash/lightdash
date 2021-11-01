import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, NonIdealState, Spinner } from '@blueprintjs/core';
import styled from 'styled-components';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import ActionCardList from '../components/common/ActionCardList';
import {
    useUpdateDashboard,
    useDeleteMutation,
} from '../hooks/dashboard/useDashboard';
import CreateSavedDashboardModal from '../components/SavedDashboards/CreateSavedDashboardModal';
import DashboardForm from '../components/SavedDashboards/DashboardForm';

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
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const { isLoading, data: dashboards = [] } = useDashboards(projectUuid);
    const useDelete = useDeleteMutation();

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading dashboards" icon={<Spinner />} />
            </div>
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
                    return `/projects/${projectUuid}/dashboards/${uuid}`;
                }}
                ModalContent={DashboardForm}
                headerAction={
                    <Button
                        text="Create dashboard"
                        onClick={() => setIsModalOpen(true)}
                        intent="primary"
                    />
                }
            />
            <CreateSavedDashboardModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                ModalContent={DashboardForm}
            />
        </SavedDashboardsWrapper>
    );
};

export default SavedDashboards;
