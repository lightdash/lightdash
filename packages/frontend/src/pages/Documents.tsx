import { ContentType, FeatureFlags } from '@lightdash/common';
import { Box, Group, Stack } from '@mantine/core';
import { Navigate } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
import classes from './Document.module.css';

const Documents = () => {
    const projectUuid = useProjectUuid();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader title="Loading documents" />;
    }
    if (flag.isError || !flag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <FavoritesProvider projectUuid={projectUuid}>
            <Box className={classes.page}>
                <Page
                    title="Documents"
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
                                    { title: 'All documents', active: true },
                                ]}
                            />
                        </Group>
                        <InfiniteResourceTable
                            key={projectUuid}
                            filters={{
                                projectUuid,
                                contentTypes: [ContentType.DOCUMENT],
                            }}
                            columnVisibility={{
                                [ColumnVisibility.VIEWS]: false,
                            }}
                            emptyState={{ entityName: 'documents' }}
                            errorStateTitle="Unable to load documents"
                        />
                    </Stack>
                </Page>
            </Box>
        </FavoritesProvider>
    );
};

export default Documents;
