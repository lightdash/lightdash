import { Button, NonIdealState, Spinner } from '@blueprintjs/core';
import { Breadcrumbs2 } from '@blueprintjs/popover2';
import { LightdashMode } from '@lightdash/common';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../components/common/Page/Page.styles';
import ResourceList from '../components/common/ResourceList';
import { useCreateMutation } from '../hooks/dashboard/useDashboard';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

const SavedDashboards = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data: dashboards = [] } = useDashboards(projectUuid);

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
            <PageContentWrapper>
                <PageHeader>
                    <PageBreadcrumbsWrapper>
                        <Breadcrumbs2
                            items={[
                                {
                                    href: '/home',
                                    text: 'Home',
                                    className: 'home-breadcrumb',
                                    onClick: (e) => {
                                        history.push('/home');
                                    },
                                },
                                { text: 'All dashboards' },
                            ]}
                        />
                    </PageBreadcrumbsWrapper>

                    {user.data?.ability?.can('manage', 'Dashboard') && !isDemo && (
                        <Button
                            text="Create dashboard"
                            icon="plus"
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
                    )}
                </PageHeader>

                <ResourceList
                    resourceType="dashboard"
                    resourceIcon="control"
                    resourceList={dashboards}
                    getURL={({ uuid }) =>
                        `/projects/${projectUuid}/dashboards/${uuid}/view`
                    }
                />
            </PageContentWrapper>
        </Page>
    );
};

export default SavedDashboards;
