import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Center, Group, Stack, Tooltip } from '@mantine/core';
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { SortDirection } from '../components/common/ResourceView/ResourceViewList';
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
        return <LoadingState title="Loading dashboards" />;
    }

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <Center my="md">
            <Helmet>
                <title>Dashboards - Lightdash</title>
            </Helmet>

            {/* FIXME: use Mantine sizes for width */}
            <Stack spacing="xl" w={900}>
                <Group position="apart" mt="xs">
                    <PageBreadcrumbs
                        mt="xs"
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

                <DashboardCreateModal
                    projectUuid={projectUuid}
                    isOpen={isCreateDashboardOpen}
                    onClose={() => setIsCreateDashboardOpen(false)}
                    onConfirm={(dashboard) => {
                        history.push(
                            `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                        );

                        setIsCreateDashboardOpen(false);
                    }}
                />

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
                                <Tooltip
                                    withArrow
                                    label="First you must create a space for this dashboard"
                                >
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
        </Center>
    );
};

export default SavedDashboards;
