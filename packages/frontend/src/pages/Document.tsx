import {
    FeatureFlags,
    type Document,
    type UuidOrSlug,
} from '@lightdash/common';
import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { lazy, Suspense, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DocumentActions from '../features/documents/DocumentActions';
import { getDocumentReturnUrl } from '../features/documents/documentNavigation';
import DocumentPageLayout from '../features/documents/DocumentPageLayout';
import DocumentRenderer from '../features/documents/DocumentRenderer';
import { useCanEditDocument } from '../features/documents/useCanEditDocument';
import { useDocument } from '../features/documents/useDocument';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const DocumentEditor = lazy(
    () => import('../features/documents/DocumentEditor'),
);

const DocumentWorkspace = ({ document }: { document: Document }) => {
    const [editingDocument, setEditingDocument] = useState<Document | null>(
        null,
    );
    const canEdit = useCanEditDocument(document);
    if (editingDocument && canEdit) {
        return (
            <Suspense fallback={<EmptyStateLoader title="Loading editor" />}>
                <DocumentEditor
                    document={editingDocument}
                    onClose={() => setEditingDocument(null)}
                />
            </Suspense>
        );
    }
    return (
        <DocumentPageLayout name={document.name}>
            <DocumentRenderer
                document={document}
                actions={
                    <Group gap="xs" wrap="nowrap">
                        {canEdit && (
                            <Tooltip label="Edit document">
                                <ActionIcon
                                    aria-label="Edit document"
                                    onClick={() => setEditingDocument(document)}
                                >
                                    <MantineIcon icon={IconPencil} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <DocumentActions document={document} />
                    </Group>
                }
            />
        </DocumentPageLayout>
    );
};

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
    return (
        <DocumentWorkspace
            key={query.data.documentUuid}
            document={query.data}
        />
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
