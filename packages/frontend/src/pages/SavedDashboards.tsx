import { ContentType, LightdashMode } from '@lightdash/common';
import { Group, Stack, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import DashboardCreateModal from '../components/common/modal/DashboardCreateModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedDashboards = () => {
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
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
        return <EmptyStateLoader my="xl" title="Loading dashboards" />;
    }

    const handleCreateDashboard = () => {
        setIsCreateDashboardOpen(true);
    };

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title="Dashboards"
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <Stack gap="xxl" w="100%">
                    <Group justify="space-between">
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
                                    leftSection={<IconPlus size={18} />}
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
                        ownerFilter
                        columnVisibility={{
                            [ColumnVisibility.OWNER]: true,
                        }}
                    />
                </Stack>

                <DashboardCreateModal
                    projectUuid={projectUuid}
                    opened={isCreateDashboardOpen}
                    onClose={() => setIsCreateDashboardOpen(false)}
                    onConfirm={(dashboard) => {
                        void navigate(
                            `/projects/${projectUrlIdentifier}/dashboards/${dashboard.slug}/edit`,
                        );

                        setIsCreateDashboardOpen(false);
                    }}
                />
            </Page>
        </FavoritesProvider>
    );
};

export default SavedDashboards;
