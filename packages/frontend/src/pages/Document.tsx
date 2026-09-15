import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Stack,
    Text,
    Title,
    useComputedColorScheme,
} from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import Page from '../components/common/Page/Page';
import PageHeader from '../components/common/Page/PageHeader';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DocumentChart from '../features/documents/DocumentChart';
import { getDocumentReturnUrl } from '../features/documents/documentNavigation';
import { useDocument } from '../features/documents/useDocument';
import ErrorBoundary from '../features/errorBoundary/ErrorBoundary';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { markdownSanitizeRehypePlugins } from '../utils/markdownUtils';

const DocumentContent = ({
    projectUuid,
    documentUuid,
}: {
    projectUuid: string;
    documentUuid: string;
}) => {
    const query = useDocument(projectUuid, documentUuid);
    const [searchParams] = useSearchParams();
    const colorScheme = useComputedColorScheme();
    const backUrl = getDocumentReturnUrl(
        searchParams.get('returnTo'),
        projectUuid,
    );
    if (query.isInitialLoading) {
        return <EmptyStateLoader title="Loading document" />;
    }
    if (query.isError || !query.data) {
        return (
            <SuboptimalState
                title="Document unavailable"
                description="This document may have been deleted, or you may not have access."
                action={
                    <Button component={Link} to={backUrl} variant="default">
                        Back
                    </Button>
                }
            />
        );
    }
    const document = query.data;
    return (
        <Page
            title={document.name}
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
            header={
                <PageHeader>
                    <Anchor component={Link} to={backUrl}>
                        Back
                    </Anchor>
                </PageHeader>
            }
        >
            <Stack gap="xl">
                <Stack gap="xs">
                    <Title order={1}>{document.name}</Title>
                    {document.description && (
                        <Text c="dimmed">{document.description}</Text>
                    )}
                </Stack>
                {document.version.content.cells.length === 0 && (
                    <Text c="dimmed">This document is empty.</Text>
                )}
                {document.version.content.cells.map((cell) => (
                    <ErrorBoundary
                        key={`${document.version.versionUuid}:${cell.id}`}
                    >
                        {cell.type === 'markdown' ? (
                            <Box data-color-mode={colorScheme}>
                                <MarkdownPreview
                                    source={cell.content}
                                    skipHtml
                                    pluginsFilter={(type, plugins) =>
                                        type === 'rehype'
                                            ? markdownSanitizeRehypePlugins
                                            : plugins
                                    }
                                />
                            </Box>
                        ) : cell.type === 'chart' &&
                          (cell.content.source === 'semantic' ||
                              cell.content.source === 'merge') ? (
                            <DocumentChart
                                projectUuid={projectUuid}
                                spaceUuid={document.spaceUuid}
                                documentUuid={documentUuid}
                                versionUuid={document.version.versionUuid}
                                cell={cell}
                            />
                        ) : (
                            <Text c="dimmed">
                                This content type is not supported yet.
                            </Text>
                        )}
                    </ErrorBoundary>
                ))}
            </Stack>
        </Page>
    );
};

const DocumentPage = () => {
    const projectUuid = useProjectUuid();
    const { documentUuid } = useParams<{ documentUuid: string }>();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader title="Loading document" />;
    }
    if (flag.isError || !flag.data?.enabled || !documentUuid) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <DocumentContent
            key={`${projectUuid}:${documentUuid}`}
            projectUuid={projectUuid}
            documentUuid={documentUuid}
        />
    );
};

export default DocumentPage;
