import { FeatureFlags } from '@lightdash/common';
import { Anchor, Box, Button } from '@mantine/core';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import Page from '../components/common/Page/Page';
import PageHeader from '../components/common/Page/PageHeader';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { getDocumentReturnUrl } from '../features/documents/documentNavigation';
import DocumentRenderer from '../features/documents/DocumentRenderer';
import { useDocument } from '../features/documents/useDocument';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import styles from './Document.module.css';

const DocumentContent = ({
    projectUuid,
    documentUuid,
}: {
    projectUuid: string;
    documentUuid: string;
}) => {
    const query = useDocument(projectUuid, documentUuid);
    const [searchParams] = useSearchParams();
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
        <Box className={styles.page}>
            <Page
                title={document.name}
                noContentPadding
                header={
                    <PageHeader>
                        <Anchor component={Link} to={backUrl}>
                            Back
                        </Anchor>
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
