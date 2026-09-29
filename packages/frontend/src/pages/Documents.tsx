import { ContentType, FeatureFlags } from '@lightdash/common';
import { Box, Button, Group, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Navigate } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import DocumentCreateModal from '../features/documents/DocumentCreateModal';
import { useContentAuthoringEnabled } from '../hooks/useContentAuthoringEnabled';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useCreateInAnySpaceAccess from '../hooks/user/useCreateInAnySpaceAccess';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
import classes from './Document.module.css';

const Documents = () => {
    const projectUuid = useProjectUuid();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    const authoringEnabled = useContentAuthoringEnabled();
    const canCreate = useCreateInAnySpaceAccess(projectUuid, 'Document');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader my="xl" title="Loading documents" />;
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
                            {authoringEnabled && canCreate && (
                                <Button
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() => setIsCreateOpen(true)}
                                >
                                    New document
                                </Button>
                            )}
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
            {isCreateOpen && (
                <DocumentCreateModal
                    projectUuid={projectUuid}
                    defaultSpaceUuid={null}
                    onClose={() => setIsCreateOpen(false)}
                />
            )}
        </FavoritesProvider>
    );
};

export default Documents;
