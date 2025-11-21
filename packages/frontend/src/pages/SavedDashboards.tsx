import { ContentType, LightdashMode } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import LoadingState from '../components/common/LoadingState';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../providers/App/useApp';

const SavedDashboards = () => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isInitialLoading, data: dashboards = [] } =
        useDashboards(projectUuid);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const { health } = useApp();
    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    if (!projectUuid) {
        return null;
    }

    if (isInitialLoading) {
        return <LoadingState title="Loading dashboards" />;
    }

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <Page
            title="Dashboards"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { title: 'Home', to: '/home' },
                            { title: 'All dashboards', active: true },
                        ]}
                    />

                    {dashboards.length > 0 &&
                        userCanCreateDashboards &&
                        !isDemo && (
                            <Button
                                leftIcon={<IconPlus size={18} />}
                                onClick={handleCreateDashboard}
                            >
                                Create dashboard
                            </Button>
                        )}
                </Group>

                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        contentTypes: [ContentType.DASHBOARD],
                    }}
                />
            </Stack>

            <DashboardCreateModal
                projectUuid={projectUuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    void navigate(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </Page>
    );
};

export default SavedDashboards;
