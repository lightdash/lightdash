import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Group, Stack, Tooltip } from '@mantine/core';
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';

import LoadingState from '../components/common/LoadingState';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

export const DEFAULT_DASHBOARD_NAME = 'Untitled dashboard';

const SavedDashboards = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: dashboards = [] } =
        useDashboards(projectUuid);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const { user, health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: spaces, isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid);
    const hasNoSpaces = spaces && spaces.length === 0;

    const userCanManageDashboards = user.data?.ability?.can(
        'manage',
        subject('Dashboard', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (isInitialLoading || isLoadingSpaces) {
        return <LoadingState title="Loading dashboards" />;
    }

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <Page title="Dashboards" withFixedContent withPaddedContent>
            <Stack spacing="xl">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { title: 'Home', to: '/home' },
                            { title: 'All dashboards', active: true },
                        ]}
                    />

                    {dashboards.length > 0 &&
                        userCanManageDashboards &&
                        !isDemo && (
                            <Button
                                leftIcon={<IconPlus size={18} />}
                                onClick={handleCreateDashboard}
                                disabled={hasNoSpaces}
                            >
                                Create dashboard
                            </Button>
                        )}
                </Group>

                <ResourceView
                    items={wrapResourceView(
                        dashboards,
                        ResourceViewItemType.DASHBOARD,
                    )}
                    listProps={{
                        defaultSort: { updatedAt: SortDirection.DESC },
                    }}
                    emptyStateProps={{
                        icon: <IconLayoutDashboard size={30} />,
                        title: 'No dashboards added yet',
                        action:
                            userCanManageDashboards &&
                            !isDemo &&
                            hasNoSpaces ? (
                                <Tooltip label="First you must create a space for this dashboard">
                                    <div>
                                        <Button
                                            leftIcon={<IconPlus size={18} />}
                                            onClick={handleCreateDashboard}
                                            disabled={hasNoSpaces}
                                        >
                                            Create dashboard
                                        </Button>
                                    </div>
                                </Tooltip>
                            ) : userCanManageDashboards && !isDemo ? (
                                <Button
                                    leftIcon={<IconPlus size={18} />}
                                    onClick={handleCreateDashboard}
                                    disabled={hasNoSpaces}
                                >
                                    Create dashboard
                                </Button>
                            ) : undefined,
                    }}
                />
            </Stack>

            <DashboardCreateModal
                projectUuid={projectUuid}
                defaultSpaceUuid={spaces?.[0]?.uuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </Page>
    );
};

export default SavedDashboards;
