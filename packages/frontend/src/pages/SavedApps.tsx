import { ContentType, FeatureFlags } from '@lightdash/common';
import { Group, Stack, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link, Navigate } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedApps = () => {
    const projectUuid = useProjectUuid();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const canCreateDataApp = useCanCreateDataApp(projectUuid);

    if (!projectUuid) {
        return null;
    }

    if (dataAppsFlag.isLoading) {
        return null;
    }

    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title="Data apps"
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
                                { title: 'All data apps', active: true },
                            ]}
                        />

                        {canCreateDataApp && (
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/apps/generate`}
                                leftSection={<IconPlus size={18} />}
                            >
                                Create data app
                            </Button>
                        )}
                    </Group>

                    <InfiniteResourceTable
                        showDataAppVersionStatus
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.DATA_APP],
                            includePersonalDataApps: true,
                            dataAppVizsFilter: 'exclude',
                        }}
                    />
                </Stack>
            </Page>
        </FavoritesProvider>
    );
};

export default SavedApps;
