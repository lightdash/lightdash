import { Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { format } from 'date-fns';
import { type FC } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import TruncatedText from '../../../components/common/TruncatedText';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useContentAsCodeSyncStatus } from '../hooks/useContentAsCodeSyncStatus';
import { type ContentAsCodeAppliedRevision } from '../types';
import { getContentAsCodeTypeLabel } from '../utils/contentAsCodeTypeLabel';
import { toDate } from '../utils/toDate';
import classes from './ContentAsCodeSyncStatusPanel.module.css';

type ContentAsCodeSyncStatusPanelProps = {
    projectUuid: string;
};

const isEmptySyncStatus = (
    lastAppliedAt: Date | string | null | undefined,
    revisionCount: number,
    revisions: ContentAsCodeAppliedRevision[],
): boolean =>
    lastAppliedAt == null && revisionCount === 0 && revisions.length === 0;

const AppliedTime: FC<{ value: Date | string }> = ({ value }) => {
    const timeAgo = useTimeAgo(value);
    const absolute = format(toDate(value), 'MMM d, yyyy HH:mm');

    return (
        <Stack gap={2} align="flex-end">
            <Text fz="sm">{timeAgo}</Text>
            <Text fz="xs" c="ldGray.6">
                {absolute}
            </Text>
        </Stack>
    );
};

const LastAppliedValue: FC<{ value: Date | string }> = ({ value }) => {
    const timeAgo = useTimeAgo(value);
    const absolute = format(toDate(value), 'MMM d, yyyy HH:mm');

    return (
        <Stack gap={2}>
            <Text fw={500}>{timeAgo}</Text>
            <Text fz="xs" c="ldGray.6">
                {absolute}
            </Text>
        </Stack>
    );
};

const ContentAsCodeRevisionRow: FC<{
    revision: ContentAsCodeAppliedRevision;
}> = ({ revision }) => {
    const shortHash = revision.contentHash.slice(0, 8);

    return (
        <Paper withBorder p="md" radius="md">
            <Group justify="space-between" wrap="nowrap" gap="md">
                <Stack gap="xs" className={classes.revisionMeta}>
                    <Badge variant="light" size="sm" tt="none">
                        {getContentAsCodeTypeLabel(revision.contentType)}
                    </Badge>
                    <TruncatedText maxWidth="100%" fw={500}>
                        {revision.slug}
                    </TruncatedText>
                    <Tooltip label={revision.contentHash}>
                        <Text fz="xs" c="ldGray.5" ff="monospace">
                            {shortHash}
                        </Text>
                    </Tooltip>
                </Stack>
                <AppliedTime value={revision.appliedAt} />
            </Group>
        </Paper>
    );
};

const ContentAsCodeSyncStatusPanel: FC<ContentAsCodeSyncStatusPanelProps> = ({
    projectUuid,
}) => {
    const { data, isInitialLoading, isError, refetch } =
        useContentAsCodeSyncStatus(projectUuid);

    if (isInitialLoading) {
        return <EmptyStateLoader title="Loading sync status" />;
    }

    if (isError) {
        return (
            <InlineErrorState
                message="Could not load content as code sync status."
                onRetry={() => {
                    void refetch();
                }}
            />
        );
    }

    const revisions = data?.revisions ?? [];
    const revisionCount = data?.revisionCount ?? 0;

    if (isEmptySyncStatus(data?.lastAppliedAt, revisionCount, revisions)) {
        return (
            <SettingsEmptyState
                icon={IconCode}
                title="No sync history yet"
                description="Applied revisions from content as code uploads will appear here."
            />
        );
    }

    return (
        <Stack gap="lg">
            <div className={classes.summary}>
                <Paper withBorder p="md" radius="md">
                    <Stack gap="xs">
                        <Text fz="sm" c="ldGray.6">
                            Last applied
                        </Text>
                        {data?.lastAppliedAt ? (
                            <LastAppliedValue value={data.lastAppliedAt} />
                        ) : (
                            <Text c="ldGray.5">—</Text>
                        )}
                    </Stack>
                </Paper>
                <Paper withBorder p="md" radius="md">
                    <Stack gap="xs">
                        <Text fz="sm" c="ldGray.6">
                            Revisions
                        </Text>
                        <Text fw={500}>{revisionCount}</Text>
                    </Stack>
                </Paper>
            </div>
            <div className={classes.revisionList}>
                {revisions.map((revision) => (
                    <ContentAsCodeRevisionRow
                        key={`${revision.contentType}:${revision.slug}:${revision.contentHash}`}
                        revision={revision}
                    />
                ))}
            </div>
        </Stack>
    );
};

export default ContentAsCodeSyncStatusPanel;
