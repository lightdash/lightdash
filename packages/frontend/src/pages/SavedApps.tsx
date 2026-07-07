import { subject } from '@casl/ability';
import { ContentType, FeatureFlags } from '@lightdash/common';
import { Button, Group, Stack } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { Link, Navigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const SavedApps = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

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

                        <Can
                            I="create"
                            this={subject('DataApp', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/apps/generate`}
                                leftSection={<IconPlus size={18} />}
                            >
                                Create data app
                            </Button>
                        </Can>
                    </Group>

                    <InfiniteResourceTable
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.DATA_APP],
                            includePersonalDataApps: true,
                        }}
                    />
                </Stack>
            </Page>
        </FavoritesProvider>
    );
};

export default SavedApps;
