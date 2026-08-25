import { subject } from '@casl/ability';
import { Stack, Text } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useState, type FC } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useApp from '../../../providers/App/useApp';
import { useContentAsCodeSyncStatus } from '../hooks/useContentAsCodeSyncStatus';
import { useRestampContentAsCodeRevision } from '../hooks/useRestampContentAsCodeRevision';
import { type ContentAsCodeSyncItem } from '../types';
import { toDate } from '../utils/toDate';
import ContentAsCodeSyncDiffModal from './ContentAsCodeSyncDiffModal';
import ContentAsCodeSyncItemRow from './ContentAsCodeSyncItemRow';

type ContentAsCodeSyncStatusPanelProps = {
    projectUuid: string;
};

const LastAppliedSummary: FC<{ value: Date | string }> = ({ value }) => {
    const timeAgo = useTimeAgo(value);

    return (
        <Text fz="sm" c="ldGray.6">
            Last applied {timeAgo} ·{' '}
            {format(toDate(value), 'MMM d, yyyy HH:mm')}
        </Text>
    );
};

const ContentAsCodeSyncStatusPanel: FC<ContentAsCodeSyncStatusPanelProps> = ({
    projectUuid,
}) => {
    const { user } = useApp();
    const { data, isInitialLoading, isError, refetch } =
        useContentAsCodeSyncStatus(projectUuid);
    const restampMutation = useRestampContentAsCodeRevision(projectUuid);
    const [diffItem, setDiffItem] = useState<ContentAsCodeSyncItem | null>(
        null,
    );

    const canRestamp =
        user.data?.ability.can(
            'create',
            subject('ContentAsCode', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const isRestampAvailable =
        data?.kind === 'ok' &&
        !(
            restampMutation.isError &&
            restampMutation.error.error.statusCode === 404
        );

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

    if (!data || data.kind === 'unavailable' || !data.status.syncEnabled) {
        return (
            <SettingsEmptyState
                icon={IconCode}
                title="Content as code sync is not available yet"
                description="This project has not enabled content as code sync, or the status API is not deployed yet."
            />
        );
    }

    const { status } = data;

    if (status.items.length === 0) {
        return (
            <SettingsEmptyState
                icon={IconCode}
                title="No managed content"
                description="Charts and dashboards managed as code will appear here with their sync state."
            />
        );
    }

    const restampingKey = restampMutation.isLoading
        ? `${restampMutation.variables?.contentType}:${restampMutation.variables?.slug}`
        : null;

    return (
        <Stack gap="md">
            {status.lastAppliedAt ? (
                <LastAppliedSummary value={status.lastAppliedAt} />
            ) : (
                <Text fz="sm" c="ldGray.6">
                    No last-applied snapshot yet
                </Text>
            )}
            <Stack gap="sm">
                {status.items.map((item) => (
                    <ContentAsCodeSyncItemRow
                        key={`${item.contentType}:${item.slug}`}
                        item={item}
                        canRestamp={canRestamp}
                        isRestampAvailable={isRestampAvailable}
                        isRestamping={
                            restampingKey === `${item.contentType}:${item.slug}`
                        }
                        onViewDiff={() => {
                            setDiffItem(item);
                        }}
                        onRestamp={() => {
                            restampMutation.mutate({
                                contentType: item.contentType,
                                slug: item.slug,
                            });
                        }}
                    />
                ))}
            </Stack>
            <ContentAsCodeSyncDiffModal
                item={diffItem}
                opened={diffItem !== null}
                onClose={() => {
                    setDiffItem(null);
                }}
            />
        </Stack>
    );
};

export default ContentAsCodeSyncStatusPanel;
