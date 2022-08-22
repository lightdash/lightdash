import { Button, NonIdealState, Spinner } from '@blueprintjs/core';
import { LightdashMode } from '@lightdash/common';
import { Redirect, useParams } from 'react-router-dom';
import ActionCardList from '../components/common/ActionCardList';
import Page from '../components/common/Page/Page';
import DashboardForm from '../components/SavedDashboards/DashboardForm';
import {
    useCreateMutation,
    useDeleteMutation,
    useUpdateDashboardName,
} from '../hooks/dashboard/useDashboard';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

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
    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: spaces, isLoading: isLoadingSpaces } = useSpaces(projectUuid);
    const hasNoSpaces = spaces && spaces.length === 0;

    if (isLoading || isLoadingSpaces) {
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
        <Page>
            <ActionCardList
                title="All dashboards"
                useUpdate={useUpdateDashboardName}
                useDelete={useDelete}
                dataList={dashboards}
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
                            disabled={hasNoSpaces}
                            title={
                                hasNoSpaces
                                    ? 'First you must create a space for this dashboard'
                                    : ''
                            }
                            intent="primary"
                        />
                    )
                }
            />
        </Page>
    );
};

export default SavedDashboards;
