import { type ItemsMap } from '@lightdash/common';
import { Anchor, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconCheck, IconHammer } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import MantineIcon from '../../../components/common/MantineIcon';
import { ReasoningHistoryRow } from '../../../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import ChatBubbleMeta from '../ChatBubbleMeta';
import ChatMessageContent from '../ChatMessageContent';
import { useGetApp } from '../hooks/useGetApp';
import {
    stripVizPromptContext,
    type VizPromptColumn,
} from '../utils/buildVizGenerationPrompt';
import { formatBuildDuration } from '../utils/formatBuildDuration';
import {
    mergeChatMessages,
    type ChatMessage,
} from '../utils/mergeChatMessages';
import {
    createChatMessageFallbacks,
    versionsToChatMessages,
} from '../utils/versionsToChatMessages';
import DataAppVizComposer from './DataAppVizComposer';
import classes from './DataAppVizConversation.module.css';
import LoadingDots from './LoadingDots';

/** Everything the composer needs; `null` renders the history read-only. */
export type VizConversationComposer = {
    itemsMap: ItemsMap;
    placeholder: string;
    isBuilding: boolean;
    /** The request that is in flight, shown optimistically before it lands. */
    pendingPrompt: string | null;
    error: string | null;
    /** Re-send the request that failed; null when there is nothing to retry. */
    onRetry: (() => void) | null;
    onSubmit: (description: string, columns: VizPromptColumn[]) => void;
};

type Props = {
    projectUuid: string;
    /** Null while authoring a visualization that does not exist yet. */
    dataAppVizUuid: string | null;
    composer: VizConversationComposer | null;
};

/** One-line summary of what a finished build produced. */
const receiptLabel = (message: ChatMessage): string => {
    const built =
        message.durationMs === null
            ? 'Built'
            : `Built in ${formatBuildDuration(message.durationMs)}`;
    const slots = message.vizSchema?.fields.map((f) => f.label) ?? [];
    return slots.length > 0 ? `${built} · ${slots.join(', ')}` : built;
};

const Receipt: FC<{ message: ChatMessage }> = ({ message }) => {
    if (message.status === 'error') {
        return (
            <Group gap={6} wrap="nowrap" align="flex-start">
                <MantineIcon icon={IconAlertTriangle} size={13} color="red.6" />
                <Text size="xs" c="red.7">
                    {message.content}
                </Text>
            </Group>
        );
    }
    return (
        <Stack gap={4}>
            {message.reasoning.length > 0 && (
                <ReasoningHistoryRow texts={message.reasoning} isLive={false} />
            )}
            {message.activity.length > 0 && (
                <ReasoningHistoryRow
                    texts={message.activity}
                    isLive={false}
                    icon={IconHammer}
                    label="Activity"
                />
            )}
            <Group gap={6} wrap="nowrap" align="flex-start">
                <MantineIcon icon={IconCheck} size={13} color="green.7" />
                <Text size="xs" c="dimmed">
                    {receiptLabel(message)}
                </Text>
            </Group>
            {/* The build's own words, when it left any beyond the receipt. */}
            {message.vizSchema === null && message.content && (
                <AiMarkdown>{message.content}</AiMarkdown>
            )}
        </Stack>
    );
};

const Request: FC<{ message: ChatMessage }> = ({ message }) => (
    <Stack gap={2}>
        <ChatBubbleMeta
            timestamp={message.timestamp}
            userName={message.userName}
        />
        {message.content ? (
            <ChatMessageContent
                content={stripVizPromptContext(message.content)}
            />
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
 * The visualization's conversation: what has been asked of it, what each build
 * produced, and the composer to ask for more — one surface, so a request you
 * just sent appears where you sent it.
 *
 * Also the authoring surface for a visualization that does not exist yet, where
 * the history is simply empty.
 */
const DataAppVizConversation: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    composer,
}) => {
    const pendingPrompt = composer?.pendingPrompt ?? null;
    const isBuilding = composer?.isBuilding ?? false;
    const error = composer?.error ?? null;
    const onRetry = composer?.onRetry ?? null;
    const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
        useGetApp(projectUuid, dataAppVizUuid ?? undefined);

    const versions = useMemo(
        () => data?.pages.flatMap((page) => page.versions) ?? [],
        [data?.pages],
    );

    const history = useMemo(
        () =>
            versionsToChatMessages(
                versions,
                dataAppVizUuid ?? undefined,
                createChatMessageFallbacks(),
            ),
        [versions, dataAppVizUuid],
    );

    const maxHistoryVersion = versions.reduce(
        (max, v) => Math.max(max, v.version),
        0,
    );

    // The in-flight request, shown the moment it is sent, and dropped once a
    // version carrying the same authored text lands in history. Version-number
    // dedupe can't be used here: the stored prompt has the column manifest
    // appended, so it never equals what was typed.
    const alreadyInHistory =
        pendingPrompt !== null &&
        history.some(
            (m) =>
                m.role === 'user' &&
                stripVizPromptContext(m.content) === pendingPrompt.trim(),
        );

    const local = useMemo<ChatMessage[]>(
        () =>
            pendingPrompt === null || alreadyInHistory
                ? []
                : [
                      {
                          role: 'user',
                          status: null,
                          durationMs: null,
                          content: pendingPrompt,
                          imagePreviewUrls: [],
                          imageResourceIds: [],
                          files: [],
                          charts: [],
                          externalConnections: [],
                          dashboardName: null,
                          clarifications: [],
                          appUuid: null,
                          version: null,
                          timestamp: new Date(),
                          userName: null,
                          vizSchema: null,
                          reasoning: [],
                          activity: [],
                      },
                  ],
        [pendingPrompt, alreadyInHistory],
    );

    const messages = mergeChatMessages(history, local, maxHistoryVersion);

    // Versions are 1-indexed and contiguous, so holding version 1 means the
    // whole history is loaded however many pages the server still offers.
    const hasOrigin = versions.some((v) => v.version === 1);
    const hasEarlier = hasNextPage && !hasOrigin;
    const oldestLoaded = versions.reduce<(typeof versions)[number] | null>(
        (oldest, v) =>
            oldest === null || v.version < oldest.version ? v : oldest,
        null,
    );

    const isLoadingHistory = dataAppVizUuid !== null && isLoading;

    return (
        <div className={classes.conversation}>
            <Stack gap="md" className={classes.messages}>
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
                        {isFetchingNextPage
                            ? 'Loading…'
                            : 'Load earlier messages'}
                    </Anchor>
                )}

                {isLoadingHistory ? (
                    <Group justify="center" p="md">
                        <Loader size="sm" />
                    </Group>
                ) : (
                    messages.map((message, index) =>
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
                    )
                )}

                {isBuilding && (
                    <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed">
                            Building
                        </Text>
                        <LoadingDots />
                    </Group>
                )}

                {error && (
                    <Group gap={6} wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={13}
                            color="red.6"
                        />
                        <Stack gap={2}>
                            <Text size="xs" c="red.7">
                                {error}
                            </Text>
                            <Text size="xs" c="dimmed">
                                Your query and chart are untouched.
                            </Text>
                            {onRetry && (
                                <Anchor
                                    component="button"
                                    type="button"
                                    size="xs"
                                    onClick={onRetry}
                                >
                                    Retry
                                </Anchor>
                            )}
                        </Stack>
                    </Group>
                )}

                {composer === null && messages.length === 0 && (
                    <Text size="sm" c="dimmed">
                        This visualization has no history yet.
                    </Text>
                )}
            </Stack>

            {composer && (
                <div className={classes.composer}>
                    <DataAppVizComposer
                        itemsMap={composer.itemsMap}
                        placeholder={composer.placeholder}
                        isBuilding={composer.isBuilding}
                        onSubmit={composer.onSubmit}
                    />
                </div>
            )}
        </div>
    );
};

export default DataAppVizConversation;
