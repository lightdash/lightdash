import { type DocumentVersionSummary } from '@lightdash/common';
import { Badge, Button, NavLink, Stack, Text } from '@mantine/core';
import InlineErrorState from '../../components/common/InlineErrorState';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { formatVersionTime, getVersionAuthor } from './documentVersions';
import { useDocumentVersions } from './useDocumentVersions';

type Props = {
    projectUuid: string;
    documentUuid: string;
    selectedVersionUuid: string | null;
    onSelect: (version: DocumentVersionSummary) => void;
};

/** Newest-first version list for the history rail; the first entry is current. */
const DocumentVersionList = ({
    projectUuid,
    documentUuid,
    selectedVersionUuid,
    onSelect,
}: Props) => {
    const versions = useDocumentVersions(projectUuid, documentUuid);
    if (versions.isInitialLoading) {
        return <SuboptimalState title="Loading versions" loading />;
    }
    if (versions.error) {
        return (
            <InlineErrorState
                message="Version history could not be loaded."
                onRetry={() => void versions.refetch()}
            />
        );
    }
    const items = versions.data?.pages.flatMap((page) => page.items) ?? [];
    return (
        <Stack gap="xxs" role="group" aria-label="Document versions">
            <Text fz="xs" fw={500} c="dimmed" mb="xs">
                Version history
            </Text>
            {items.map((version, index) => {
                const timestamp = formatVersionTime(version.createdAt);
                const selected = version.versionUuid === selectedVersionUuid;
                return (
                    <NavLink
                        key={version.versionUuid}
                        component="button"
                        type="button"
                        active={selected}
                        aria-pressed={selected}
                        aria-label={`Version ${version.versionNumber}, saved ${timestamp} by ${getVersionAuthor(version)}`}
                        label={timestamp}
                        description={getVersionAuthor(version)}
                        rightSection={
                            index === 0 ? (
                                <Badge size="xs">Current</Badge>
                            ) : null
                        }
                        onClick={() => onSelect(version)}
                    />
                );
            })}
            {versions.hasNextPage && (
                <Button
                    variant="subtle"
                    size="xs"
                    loading={versions.isFetchingNextPage}
                    onClick={() => void versions.fetchNextPage()}
                >
                    Load older versions
                </Button>
            )}
        </Stack>
    );
};

export default DocumentVersionList;
