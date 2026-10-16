import {
    FeatureFlags,
    getDocumentUrl,
    type Document,
    type DocumentVersionSummary,
    type UuidOrSlug,
} from '@lightdash/common';
import { ActionIcon, Badge, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowsDiff, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
import DocumentVersionComparison from '../features/documents/DocumentVersionComparison';
import DocumentVersionList from '../features/documents/DocumentVersionList';
import {
    formatVersionTime,
    getVersionAuthor,
} from '../features/documents/documentVersions';
import DocumentReportLayout from '../features/documents/presentation/DocumentReportLayout';
import { useDocument } from '../features/documents/useDocument';
import {
    useDocumentVersion,
    useDocumentVersions,
} from '../features/documents/useDocumentVersions';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const VERSION_PARAM = 'version';
const COMPARE_PARAM = 'compare';

const VersionByline = ({
    summary,
    isCurrent,
}: {
    summary: DocumentVersionSummary | null;
    isCurrent: boolean;
}) => {
    const { t } = useTranslation('pages');
    return (
        <Group gap="xs" wrap="nowrap">
            {summary && (
                <>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        role="group"
                        aria-label={t('documentHistory.savedBy')}
                    >
                        {summary.createdBy && (
                            <LightdashUserAvatar
                                userUuid={summary.createdBy.userUuid}
                                avatarUrl={summary.createdBy.avatarUrl}
                                avatarGradient={
                                    summary.createdBy.avatarGradient
                                }
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
                        {t('documentHistory.saved', {
                            time: formatVersionTime(summary.createdAt),
                        })}
                    </Text>
                    <Text fz="xs" c="dimmed" aria-hidden>
                        ·
                    </Text>
                    <Badge size="sm" role="status">
                        {isCurrent
                            ? t('documentHistory.currentVersion', {
                                  number: summary.versionNumber,
                              })
                            : t('documentHistory.version', {
                                  number: summary.versionNumber,
                              })}
                    </Badge>
                </>
            )}
        </Group>
    );
};

const DocumentHistoryView = ({ document }: { document: Document }) => {
    const { t } = useTranslation('pages');
    const navigate = useNavigate();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedVersionUuid =
        searchParams.get(VERSION_PARAM) ?? document.version.versionUuid;
    const isCurrent = selectedVersionUuid === document.version.versionUuid;
    const isComparing = !isCurrent && searchParams.get(COMPARE_PARAM) === '1';
    const historical = useDocumentVersion(
        document.projectUuid,
        document.documentUuid,
        isCurrent ? null : selectedVersionUuid,
    );
    const versions = useDocumentVersions(
        document.projectUuid,
        document.documentUuid,
    );
    const documentUrl = getDocumentUrl(
        projectUrlIdentifier,
        document.documentUuid,
        document.slug,
    );
    // Keep the last shown version up while the next loads so the rail (and
    // its focus) stays mounted; the byline follows what is actually shown
    const shown = isCurrent ? document : (historical.data ?? document);
    const shownIsCurrent =
        shown.version.versionUuid === document.version.versionUuid;
    const summary =
        versions.data?.pages
            .flatMap((page) => page.items)
            .find(
                (version) => version.versionUuid === shown.version.versionUuid,
            ) ?? null;

    const rail = (
        <DocumentVersionList
            projectUuid={document.projectUuid}
            documentUuid={document.documentUuid}
            selectedVersionUuid={selectedVersionUuid}
            onSelect={(version) =>
                setSearchParams(
                    version.versionUuid === document.version.versionUuid
                        ? {}
                        : {
                              [VERSION_PARAM]: version.versionUuid,
                              ...(isComparing ? { [COMPARE_PARAM]: '1' } : {}),
                          },
                    { replace: true },
                )
            }
        />
    );

    if (!isCurrent && historical.error) {
        return (
            <SuboptimalState
                title={t('documentHistory.versionUnavailable')}
                description={t('documentHistory.versionUnavailableDescription')}
                action={
                    <Button
                        variant="default"
                        onClick={() => setSearchParams({}, { replace: true })}
                    >
                        {t('documentHistory.showCurrent')}
                    </Button>
                }
            />
        );
    }
    const metadata = (
        <VersionByline summary={summary} isCurrent={shownIsCurrent} />
    );
    const actions = (
        <ActionIcon.Group
            role="group"
            aria-label={t('documentHistory.controls')}
        >
            {!isCurrent && (
                <Tooltip
                    label={
                        isComparing
                            ? t('documentHistory.showThisVersion')
                            : t('documentHistory.compareWithCurrent')
                    }
                >
                    <ActionIcon
                        variant={isComparing ? 'filled' : 'default'}
                        size="lg"
                        aria-label={t('documentHistory.compareWithCurrent')}
                        aria-pressed={isComparing}
                        onClick={() =>
                            setSearchParams(
                                {
                                    [VERSION_PARAM]: selectedVersionUuid,
                                    ...(isComparing
                                        ? {}
                                        : { [COMPARE_PARAM]: '1' }),
                                },
                                { replace: true },
                            )
                        }
                    >
                        <MantineIcon icon={IconArrowsDiff} />
                    </ActionIcon>
                </Tooltip>
            )}
            <Tooltip label={t('documentHistory.close')}>
                <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label={t('documentHistory.close')}
                    onClick={() => void navigate(documentUrl)}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            </Tooltip>
        </ActionIcon.Group>
    );
    return (
        <DocumentPageLayout name={document.name}>
            {isComparing ? (
                <DocumentReportLayout
                    title={document.name}
                    contentsLabel={null}
                    headings={[]}
                    variant="document"
                    rail={rail}
                    metadata={metadata}
                    actions={actions}
                >
                    {historical.data ? (
                        <DocumentVersionComparison
                            before={historical.data.version.content}
                            after={document.version.content}
                            description={t('documentHistory.changesFrom', {
                                from: historical.data.version.versionNumber,
                                to: document.version.versionNumber,
                            })}
                        />
                    ) : (
                        <EmptyStateLoader
                            title={t('documentHistory.loadingVersion')}
                        />
                    )}
                </DocumentReportLayout>
            ) : (
                <DocumentRenderer
                    // Titles and access come from the current Document, content from the version
                    document={{ ...shown, name: document.name }}
                    rail={rail}
                    metadata={metadata}
                    actions={actions}
                />
            )}
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
    const { t } = useTranslation('pages');
    const query = useDocument(projectUuid, documentUuidOrSlug);
    const projectUrlIdentifier = useProjectUrlIdentifier();
    if (query.isInitialLoading) {
        return (
            <EmptyStateLoader my="xl" title={t('documentHistory.loading')} />
        );
    }
    if (query.isError || !query.data) {
        return (
            <SuboptimalState
                title={t('document.unavailable')}
                description={t('document.unavailableDescription')}
                action={
                    <Button
                        component={Link}
                        to={`/projects/${projectUrlIdentifier}/documents`}
                        variant="default"
                    >
                        {t('actions.back', { ns: 'common' })}
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
    const { t } = useTranslation('pages');
    const projectUuid = useProjectUuid();
    const { documentUuidOrSlug } = useParams<{
        documentUuidOrSlug: UuidOrSlug;
    }>();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return (
            <EmptyStateLoader my="xl" title={t('documentHistory.loading')} />
        );
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
