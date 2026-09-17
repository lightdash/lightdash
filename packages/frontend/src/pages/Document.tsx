import { FeatureFlags, type UuidOrSlug } from '@lightdash/common';
import { Box, Button, Group, Title } from '@mantine/core';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { DASHBOARD_HEADER_HEIGHT } from '../components/common/Dashboard/dashboard.constants';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import Page from '../components/common/Page/Page';
import PageHeader from '../components/common/Page/PageHeader';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import TruncatedText from '../components/common/TruncatedText';
import DocumentActions from '../features/documents/DocumentActions';
import { getDocumentReturnUrl } from '../features/documents/documentNavigation';
import DocumentRenderer from '../features/documents/DocumentRenderer';
import reportStyles from '../features/documents/presentation/ReportPresentation.module.css';
import { useDocument } from '../features/documents/useDocument';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import styles from './Document.module.css';

const DocumentContent = ({
    projectUuid,
    documentUuidOrSlug,
}: {
    projectUuid: string;
    documentUuidOrSlug: UuidOrSlug;
}) => {
    const query = useDocument(projectUuid, documentUuidOrSlug);
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const [searchParams] = useSearchParams();
    const backUrl = getDocumentReturnUrl(
        searchParams.get('returnTo'),
        projectUrlIdentifier,
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
        <Box className={styles.page}>
            <Page
                title={document.name}
                noContentPadding
                header={
                    <PageHeader
                        cardProps={{
                            px: 0,
                            py: 0,
                            h: DASHBOARD_HEADER_HEIGHT,
                        }}
                    >
                        <Group
                            className={reportStyles.reportControls}
                            wrap="nowrap"
                            justify="space-between"
                        >
                            <Title order={6} flex={1} miw={0}>
                                <TruncatedText
                                    maxWidth="100%"
                                    inline
                                    inherit
                                    display="block"
                                >
                                    {document.name}
                                </TruncatedText>
                            </Title>
                            <DocumentActions document={document} />
                        </Group>
                    </PageHeader>
                }
            >
                <DocumentRenderer document={document} />
            </Page>
        </Box>
    );
};

const DocumentPage = () => {
    const projectUuid = useProjectUuid();
    const { documentUuidOrSlug } = useParams<{
        documentUuidOrSlug: UuidOrSlug;
    }>();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader title="Loading document" />;
    }
    if (flag.isError || !flag.data?.enabled || !documentUuidOrSlug) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <DocumentContent
            key={`${projectUuid}:${documentUuidOrSlug}`}
            projectUuid={projectUuid}
            documentUuidOrSlug={documentUuidOrSlug}
        />
    );
};

export default DocumentPage;
