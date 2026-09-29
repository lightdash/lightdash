import {
    FeatureFlags,
    type Document,
    type UuidOrSlug,
} from '@lightdash/common';
import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DocumentActions from '../features/documents/DocumentActions';
import {
    getDocumentReturnUrl,
    isStartEditingState,
} from '../features/documents/documentNavigation';
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
    const location = useLocation();
    const navigate = useNavigate();
    const startEditing = isStartEditingState(location.state);
    const [editingDocument, setEditingDocument] = useState<Document | null>(
        startEditing ? document : null,
    );
    const canEdit = useCanEditDocument(document);
    // Reading and editing are separate layouts; carry the scroll offset across
    const scrollTop = useRef(0);
    const [openAt, setOpenAt] = useState(0);
    const trackScroll = (top: number) => {
        scrollTop.current = top;
    };
    // One-shot: a reload or shared link opens the reader, not the editor
    useEffect(() => {
        if (startEditing) {
            void navigate(
                { pathname: location.pathname, search: location.search },
                { replace: true, state: null },
            );
        }
    }, [startEditing, navigate, location.pathname, location.search]);
    if (editingDocument && canEdit) {
        return (
            <Suspense
                fallback={<EmptyStateLoader my="xl" title="Loading editor" />}
            >
                <DocumentEditor
                    document={editingDocument}
                    initialScrollTop={openAt}
                    onScrollTopChange={trackScroll}
                    onClose={() => {
                        setOpenAt(scrollTop.current);
                        setEditingDocument(null);
                    }}
                />
            </Suspense>
        );
    }
    return (
        <DocumentPageLayout name={document.name}>
            <DocumentRenderer
                document={document}
                initialScrollTop={openAt}
                onScrollTopChange={trackScroll}
                actions={
                    <ActionIcon.Group
                        role="group"
                        aria-label="Document controls"
                    >
                        {canEdit && (
                            <Tooltip label="Edit document">
                                <ActionIcon
                                    variant="default"
                                    size="lg"
                                    aria-label="Edit document"
                                    onClick={() => {
                                        setOpenAt(scrollTop.current);
                                        setEditingDocument(document);
                                    }}
                                >
                                    <MantineIcon icon={IconPencil} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <DocumentActions document={document} />
                    </ActionIcon.Group>
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
        return <EmptyStateLoader my="xl" title="Loading document" />;
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
        return <EmptyStateLoader my="xl" title="Loading document" />;
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
