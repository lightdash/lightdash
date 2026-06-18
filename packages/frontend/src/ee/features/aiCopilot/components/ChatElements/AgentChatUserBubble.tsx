import { type AiAgentMessageUser, type AiAgentUser } from '@lightdash/common';
import {
    Anchor,
    Box,
    Card,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import { format, parseISO } from 'date-fns';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import useApp from '../../../../../providers/App/useApp';
import { PinnedContextCard } from '../PinnedContextCard/PinnedContextCard';
import styles from './AgentChatUserBubble.module.css';
import { ContentReferenceLink } from './ContentReferenceLink';
import {
    buildContentReferenceSegments,
    getPromptContextItemHref,
    getPromptContextItemKey,
} from './contentReferenceUtils';

type Props = {
    message: AiAgentMessageUser<AiAgentUser>;
    isActive?: boolean;
};

const getVisibleUserName = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.toLowerCase() === 'undefined undefined') {
        return null;
    }

    return trimmedName;
};

export const UserBubble: FC<Props> = ({ message, isActive = false }) => {
    const { projectUuid, agentUuid } = useParams();
    const timeAgo = useTimeAgo(message.createdAt);
    const name = getVisibleUserName(message.user.name);
    const app = useApp();
    const showUserName =
        !!name && app.user?.data?.userUuid !== message.user.uuid;
    const { matchedKeys, segments } = buildContentReferenceSegments(
        message.message,
        message.context,
    );
    const hasInlineReferences = segments.some(
        (segment) => segment.type === 'reference',
    );
    const remainingContext = message.context.filter((item) => {
        if (!hasInlineReferences) return true;
        return !matchedKeys.has(getPromptContextItemKey(item));
    });

    return (
        <Stack
            gap={2}
            className={styles.bubble}
            bg={isActive ? 'ldGray.0' : 'transparent'}
        >
            <Stack gap={0} align="flex-end">
                {showUserName ? (
                    <Text size="sm" c="ldGray.7" fw={600}>
                        {name}
                    </Text>
                ) : null}
                <Tooltip
                    label={format(parseISO(message.createdAt), 'PPpp')}
                    withinPortal
                >
                    <Anchor
                        component={Link}
                        c="dimmed"
                        fz={10}
                        to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${message.threadUuid}/messages/${message.uuid}`}
                    >
                        {timeAgo}
                    </Anchor>
                </Tooltip>
            </Stack>

            {remainingContext.length > 0 && projectUuid && (
                <Group
                    gap="xs"
                    wrap="wrap"
                    justify="flex-end"
                    className={styles.contextGroup}
                >
                    {remainingContext.map((item, idx) => (
                        <PinnedContextCard
                            key={`${getPromptContextItemKey(item)}-${idx}`}
                            item={item}
                            projectUuid={projectUuid}
                        />
                    ))}
                </Group>
            )}

            <Card
                pos="relative"
                radius="md"
                py={6}
                px="sm"
                withBorder
                color="white"
                className={styles.messageCard}
            >
                {hasInlineReferences && projectUuid ? (
                    <Box className={`${styles.markdown} ${styles.messageText}`}>
                        {segments.map((segment, idx) => {
                            if (segment.type === 'text') {
                                return (
                                    <MDEditor.Markdown
                                        key={`text-${idx}`}
                                        source={segment.text}
                                        className={`${styles.markdown} ${styles.inlineMarkdown}`}
                                    />
                                );
                            }
                            // File/repository (and thread) references have no
                            // in-app destination — only show the arrow and link
                            // affordance when there is somewhere to navigate to.
                            const href = getPromptContextItemHref(
                                segment.item,
                                projectUuid,
                            );
                            return (
                                <ContentReferenceLink
                                    key={`${segment.key}-${idx}`}
                                    chartKind={
                                        segment.item.type === 'chart'
                                            ? (segment.item.chartKind ??
                                              undefined)
                                            : undefined
                                    }
                                    kind={segment.item.type}
                                    rel={href ? 'noreferrer' : undefined}
                                    target={href ? '_blank' : undefined}
                                    to={href ?? undefined}
                                    showArrow={href !== null}
                                >
                                    {segment.label}
                                </ContentReferenceLink>
                            );
                        })}
                    </Box>
                ) : (
                    <MDEditor.Markdown
                        source={message.message}
                        className={styles.markdown}
                    />
                )}
            </Card>
        </Stack>
    );
};
