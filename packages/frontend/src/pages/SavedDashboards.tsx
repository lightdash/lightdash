import { Button, NonIdealState, Spinner } from '@blueprintjs/core';
import { Breadcrumbs2, Tooltip2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import {
    PageBreadcrumbsWrapper,
    PageContentWrapper,
    PageHeader,
} from '../components/common/Page/Page.styles';
import ResourceList from '../components/common/ResourceList';
import {
    ResourceBreadcrumbTitle,
    ResourceTag,
} from '../components/common/ResourceList/ResourceList.styles';
import { SortDirection } from '../components/common/ResourceList/ResourceTable';
import CreateSavedDashboardModal from '../components/SavedDashboards/CreateSavedDashboardModal';
import { useCreateMutation } from '../hooks/dashboard/useDashboard';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

const SavedDashboards = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data: dashboards = [] } = useDashboards(projectUuid);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

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

    const userCanManageDashboards = user.data?.ability?.can(
        'manage',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

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

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <Page>
            <Helmet>
                <title>Dashboards - Lightdash</title>
            </Helmet>
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
                                {
                                    text: (
                                        <ResourceBreadcrumbTitle>
                                            All dashboards
                                            {dashboards.length > 0 && (
                                                <ResourceTag round>
                                                    {dashboards.length}
                                                </ResourceTag>
                                            )}
                                        </ResourceBreadcrumbTitle>
                                    ),
                                },
                            ]}
                        />
                    </PageBreadcrumbsWrapper>

                    {userCanManageDashboards &&
                        !isDemo &&
                        (dashboards.length > 0 || hasNoSpaces) && (
                            <Tooltip2
                                content={
                                    hasNoSpaces
                                        ? 'First you must create a space for this dashboard'
                                        : undefined
                                }
                                interactionKind="hover"
                            >
                                <Button
                                    text="Create dashboard"
                                    icon="plus"
                                    loading={isCreatingDashboard}
                                    onClick={handleCreateDashboard}
                                    disabled={hasNoSpaces}
                                    intent="primary"
                                />
                            </Tooltip2>
                        )}
                </PageHeader>
                {isCreateDashboardOpen && (
                    <CreateSavedDashboardModal
                        isOpen={true}
                        redirectToEditDashboard={true}
                        onClose={() => setIsCreateDashboardOpen(false)}
                    />
                )}

                <ResourceList
                    resourceType="dashboard"
                    resourceIcon="control"
                    resourceList={dashboards}
                    defaultSort={{
                        updatedAt: SortDirection.DESC,
                    }}
                    onClickCTA={
                        !isDemo && !hasNoSpaces && userCanManageDashboards
                            ? handleCreateDashboard
                            : undefined
                    }
                    getURL={({ uuid }) =>
                        `/projects/${projectUuid}/dashboards/${uuid}/view`
                    }
                />
            </PageContentWrapper>
        </Page>
    );
};

export default SavedDashboards;
