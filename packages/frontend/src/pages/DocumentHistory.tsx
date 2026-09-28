import {
    FeatureFlags,
    getDocumentUrl,
    type Document,
    type DocumentVersionSummary,
    type UuidOrSlug,
} from '@lightdash/common';
import { ActionIcon, Badge, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import {
    Link,
    Navigate,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { LightdashUserAvatar } from '../components/Avatar';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import DocumentPageLayout from '../features/documents/DocumentPageLayout';
import DocumentRenderer from '../features/documents/DocumentRenderer';
import DocumentVersionList from '../features/documents/DocumentVersionList';
import {
    formatVersionTime,
    getVersionAuthor,
} from '../features/documents/documentVersions';
import { useDocument } from '../features/documents/useDocument';
import {
    useDocumentVersion,
    useDocumentVersions,
} from '../features/documents/useDocumentVersions';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const VERSION_PARAM = 'version';

const VersionByline = ({
    summary,
    isCurrent,
}: {
    summary: DocumentVersionSummary | null;
    isCurrent: boolean;
}) => (
    <Group gap="xs" wrap="nowrap">
        {summary && (
            <>
                <Group
                    gap="xs"
                    wrap="nowrap"
                    role="group"
                    aria-label="Saved by"
                >
                    {summary.createdBy && (
                        <LightdashUserAvatar
                            userUuid={summary.createdBy.userUuid}
                            avatarUrl={summary.createdBy.avatarUrl}
                            avatarGradient={summary.createdBy.avatarGradient}
                            name={getVersionAuthor(summary)}
                            size="sm"
                            aria-hidden
                        />
                    )}
                    <Text fz="xs" fw={500} c="dimmed">
                        {getVersionAuthor(summary)}
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" aria-hidden>
                    ·
                </Text>
                <Text fz="xs" c="dimmed">
                    Saved {formatVersionTime(summary.createdAt)}
                </Text>
                <Text fz="xs" c="dimmed" aria-hidden>
                    ·
                </Text>
                <Badge size="sm" role="status">
                    {isCurrent
                        ? `Current version ${summary.versionNumber}`
                        : `Version ${summary.versionNumber}`}
                </Badge>
            </>
        )}
    </Group>
);

const DocumentHistoryView = ({ document }: { document: Document }) => {
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedVersionUuid =
        searchParams.get(VERSION_PARAM) ?? document.version.versionUuid;
    const isCurrent = selectedVersionUuid === document.version.versionUuid;
    const historical = useDocumentVersion(
        document.projectUuid,
        document.documentUuid,
        isCurrent ? null : selectedVersionUuid,
    );
    const versions = useDocumentVersions(
        document.projectUuid,
        document.documentUuid,
    );
    const summary =
        versions.data?.pages
            .flatMap((page) => page.items)
            .find((version) => version.versionUuid === selectedVersionUuid) ??
        null;
    const documentUrl = getDocumentUrl(
        projectUrlIdentifier,
        document.documentUuid,
        document.slug,
    );
    const shown = isCurrent ? document : historical.data;

    const rail = (
        <DocumentVersionList
            projectUuid={document.projectUuid}
            documentUuid={document.documentUuid}
            selectedVersionUuid={selectedVersionUuid}
            onSelect={(version) =>
                setSearchParams(
                    version.versionUuid === document.version.versionUuid
                        ? {}
                        : { [VERSION_PARAM]: version.versionUuid },
                    { replace: true },
                )
            }
        />
    );

    if (!isCurrent && historical.error) {
        return (
            <SuboptimalState
                title="Version unavailable"
                description="This version does not belong to this document, or it could not be loaded."
                action={
                    <Button
                        variant="default"
                        onClick={() => setSearchParams({}, { replace: true })}
                    >
                        Show current version
                    </Button>
                }
            />
        );
    }
    if (!shown) {
        return <EmptyStateLoader my="xl" title="Loading version" />;
    }
    return (
        <DocumentPageLayout name={document.name}>
            <DocumentRenderer
                // Titles and access come from the current Document, content from the version
                document={{ ...shown, name: document.name }}
                rail={rail}
                metadata={
                    <VersionByline summary={summary} isCurrent={isCurrent} />
                }
                actions={
                    <ActionIcon.Group
                        role="group"
                        aria-label="Version history controls"
                    >
                        <Tooltip label="Close version history">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label="Close version history"
                                onClick={() => void navigate(documentUrl)}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    </ActionIcon.Group>
                }
            />
        </DocumentPageLayout>
    );
};

const DocumentHistoryContent = ({
    projectUuid,
    documentUuidOrSlug,
}: {
    projectUuid: string;
    documentUuidOrSlug: UuidOrSlug;
}) => {
    const query = useDocument(projectUuid, documentUuidOrSlug);
    const projectUrlIdentifier = useProjectUrlIdentifier();
    if (query.isInitialLoading) {
        return <EmptyStateLoader my="xl" title="Loading version history" />;
    }
    if (query.isError || !query.data) {
        return (
            <SuboptimalState
                title="Document unavailable"
                description="This document may have been deleted, or you may not have access."
                action={
                    <Button
                        component={Link}
                        to={`/projects/${projectUrlIdentifier}/documents`}
                        variant="default"
                    >
                        Back
                    </Button>
                }
            />
        );
    }
    return (
        <DocumentHistoryView
            key={query.data.documentUuid}
            document={query.data}
        />
    );
};

const DocumentHistoryPage = () => {
    const projectUuid = useProjectUuid();
    const { documentUuidOrSlug } = useParams<{
        documentUuidOrSlug: UuidOrSlug;
    }>();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader my="xl" title="Loading version history" />;
    }
    if (flag.isError || !flag.data?.enabled || !documentUuidOrSlug) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <DocumentHistoryContent
            key={`${projectUuid}:${documentUuidOrSlug}`}
            projectUuid={projectUuid}
            documentUuidOrSlug={documentUuidOrSlug}
        />
    );
};

export default DocumentHistoryPage;
