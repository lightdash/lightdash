import { Anchor, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import ChatBubbleMeta from '../ChatBubbleMeta';
import { useGetApp } from '../hooks/useGetApp';
import { formatBuildDuration } from '../utils/formatBuildDuration';
import { type ChatMessage } from '../utils/mergeChatMessages';
import {
    createChatMessageFallbacks,
    versionsToChatMessages,
} from '../utils/versionsToChatMessages';

type Props = {
    projectUuid: string;
    dataAppVizUuid: string;
};

/** One-line summary of what a finished build produced. */
const receiptLabel = (message: ChatMessage): string => {
    if (message.status === 'error') return message.content;
    const built =
        message.durationMs === null
            ? 'Built'
            : `Built in ${formatBuildDuration(message.durationMs)}`;
    const slots = message.vizSchema?.fields.map((f) => f.label) ?? [];
    return slots.length > 0 ? `${built} · ${slots.join(', ')}` : built;
};

const Receipt: FC<{ message: ChatMessage }> = ({ message }) => {
    const failed = message.status === 'error';
    return (
        <Group gap={6} wrap="nowrap" align="flex-start">
            <MantineIcon
                icon={failed ? IconAlertTriangle : IconCheck}
                size={13}
                color={failed ? 'red.6' : 'green.7'}
            />
            <Text size="xs" c={failed ? 'red.7' : 'dimmed'}>
                {receiptLabel(message)}
            </Text>
        </Group>
    );
};

const Request: FC<{ message: ChatMessage }> = ({ message }) => (
    <Stack gap={2}>
        <ChatBubbleMeta
            timestamp={message.timestamp}
            userName={message.userName}
        />
        {message.content ? (
            <Text size="sm">{message.content}</Text>
        ) : (
            <Text size="sm" c="dimmed" fs="italic">
                Uploaded from source
            </Text>
        )}
    </Stack>
);

/** Author + age of the viz, from the oldest version loaded so far. */
const Provenance: FC<{
    authorName: string | null;
    at: Date;
    isOrigin: boolean;
}> = ({ authorName, at, isOrigin }) => {
    const timeAgo = useTimeAgo(at);
    const verb = isOrigin ? 'Built' : 'Last updated';
    return (
        <Text size="xs" c="dimmed">
            {authorName
                ? `${verb} by ${authorName} · ${timeAgo}`
                : `${verb} ${timeAgo}`}
        </Text>
    );
};

/**
 * The viz's conversation, read-only: who built it, every request made against
 * it, and a one-line receipt per finished build. Sourced entirely from the
 * app's version history, which is already fetched for the chart's preview — so
 * this adds no request of its own.
 */
const DataAppVizThread: FC<Props> = ({ projectUuid, dataAppVizUuid }) => {
    const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
        useGetApp(projectUuid, dataAppVizUuid);

    const versions = useMemo(
        () => data?.pages.flatMap((page) => page.versions) ?? [],
        [data?.pages],
    );

    const messages = useMemo(
        () =>
            versionsToChatMessages(
                versions,
                dataAppVizUuid,
                createChatMessageFallbacks(),
            ),
        [versions, dataAppVizUuid],
    );

    // Versions are 1-indexed and contiguous, so holding version 1 means the
    // whole history is loaded however many pages the server still offers.
    const hasOrigin = versions.some((v) => v.version === 1);
    const hasEarlier = hasNextPage && !hasOrigin;
    const oldestLoaded = versions.reduce<(typeof versions)[number] | null>(
        (oldest, v) =>
            oldest === null || v.version < oldest.version ? v : oldest,
        null,
    );

    if (isLoading) {
        return (
            <Group justify="center" p="md">
                <Loader size="sm" />
            </Group>
        );
    }

    if (messages.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                This visualization has no history yet.
            </Text>
        );
    }

    return (
        <Stack gap="md">
            {oldestLoaded && (
                <Provenance
                    authorName={
                        oldestLoaded.createdByUser
                            ? [
                                  oldestLoaded.createdByUser.firstName,
                                  oldestLoaded.createdByUser.lastName,
                              ]
                                  .filter((s) => s.length > 0)
                                  .join(' ') || null
                            : null
                    }
                    at={new Date(oldestLoaded.createdAt)}
                    isOrigin={hasOrigin}
                />
            )}

            {hasEarlier && (
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                >
                    {isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                </Anchor>
            )}

            {messages.map((message, index) =>
                message.role === 'user' ? (
                    <Request
                        key={`${message.timestamp.getTime()}-${index}`}
                        message={message}
                    />
                ) : (
                    <Receipt
                        key={`${message.timestamp.getTime()}-${index}`}
                        message={message}
                    />
                ),
            )}
        </Stack>
    );
};

export default DataAppVizThread;
