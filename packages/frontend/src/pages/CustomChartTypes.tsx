import { subject } from '@casl/ability';
import { ContentType, FeatureFlags } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { Navigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';

const CustomChartTypes = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    if (!projectUuid || dataAppsFlag.isLoading || !user.data) {
        return null;
    }

    const canManageExplore = user.data.ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );

    if (!dataAppsFlag.data?.enabled || !canManageExplore) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Page
                title="Custom chart types"
                withCenteredRoot
                withCenteredContent
                withXLargePaddedContent
                withLargeContent
            >
                <Stack gap="xxl" w="100%">
                    <PageBreadcrumbs
                        items={[
                            { title: 'Home', to: '/home' },
                            { title: 'Custom chart types', active: true },
                        ]}
                    />

                    <InfiniteResourceTable
                        filters={{
                            projectUuid,
                            contentTypes: [ContentType.DATA_APP],
                            dataAppVizsFilter: 'only',
                        }}
                        columnVisibility={{
                            // Vizs are spaceless — the column is always empty.
                            [ColumnVisibility.SPACE]: false,
                        }}
                        emptyState={{
                            entityName: 'custom chart types',
                            emptyMessage: 'No custom chart types yet',
                            description:
                                'Create one from any chart in Explorer: open the chart type picker, choose Custom, and generate a new chart type.',
                        }}
                    />
                </Stack>
            </Page>
        </FavoritesProvider>
    );
};

export default CustomChartTypes;
