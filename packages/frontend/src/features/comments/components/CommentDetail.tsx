import {
    HTML_SANITIZE_DEFAULT_RULES,
    sanitizeHtml,
    type Comment,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    getDefaultZIndex,
    Grid,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconCircleCheck,
    IconDotsVertical,
    IconMessage,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';
import MantineIcon from '../../../components/common/MantineIcon';
import { getNameInitials } from '../utils';
import styles from './CommentDetail.module.css';
import { CommentTimestamp } from './CommentTimestamp';

// Mentions are stored as styled spans; render them as the mention pill instead.
const COMMENT_RENDER_RULES = {
    ...HTML_SANITIZE_DEFAULT_RULES,
    allowedAttributes: { span: ['class'] },
    transformTags: {
        span: () => ({ tagName: 'span', attribs: { class: 'ld-mention' } }),
    },
};

type Props = {
    comment: Comment;
    canRemove: boolean;
    canReply: boolean;
    canResolve: boolean;
    canUnresolve: boolean;
    onRemove: () => void;
    onReply?: () => void;
    onResolve?: () => void;
    onUnresolve?: () => void;
};

export const CommentDetail: FC<Props> = ({
    comment,
    canRemove,
    onRemove,
    canReply,
    onReply,
    canResolve,
    onResolve,
    canUnresolve,
    onUnresolve,
}) => {
    const { ref, hovered } = useHover();

    /**
     * Content should already be sanitized from the API, but as an extra
     * precaution we also sanitize it before rendering.
     */
    const sanitizedCommentTextHtml = useMemo(
        () => sanitizeHtml(comment.textHtml, COMMENT_RENDER_RULES),
        [comment.textHtml],
    );

    return (
        <Box ref={ref}>
            <Grid columns={20}>
                <Grid.Col span={2}>
                    <LightdashUserAvatar
                        size="sm"
                        userUuid={comment.user.userUuid}
                        avatarUrl={comment.user.avatarUrl}
                        avatarGradient={comment.user.avatarGradient}
                    >
                        {getNameInitials(comment.user.name)}
                    </LightdashUserAvatar>
                </Grid.Col>
                <Grid.Col span={18}>
                    <Group justify="space-between">
                        <Group gap="xs">
                            <Text fz="xs" fw={600}>
                                {comment.user.name}
                            </Text>
                            <CommentTimestamp timestamp={comment.createdAt} />
                        </Group>

                        <Group
                            gap="two"
                            opacity={hovered ? 1 : 0}
                            className={styles.actions}
                        >
                            {canReply && onReply && (
                                <Tooltip
                                    label="Reply"
                                    zIndex={getDefaultZIndex('popover') + 1}
                                >
                                    <ActionIcon
                                        size="xs"
                                        onClick={() => onReply()}
                                        color="blue"
                                    >
                                        <MantineIcon icon={IconMessage} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {(canRemove ||
                                (canResolve && onResolve) ||
                                (canUnresolve && onUnresolve)) && (
                                <Menu
                                    position="right"
                                    withArrow
                                    zIndex={getDefaultZIndex('popover') + 1}
                                >
                                    <Menu.Target>
                                        <ActionIcon
                                            size="xs"
                                            // Walkthrough anchor
                                            // (data-tour-via).
                                            data-tour-anchor="comment-actions"
                                            data-tour-hint="Open the comment's menu"
                                        >
                                            <MantineIcon
                                                icon={IconDotsVertical}
                                            />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown
                                        p={0}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {canResolve && onResolve && (
                                            <Menu.Item
                                                p="xs"
                                                fz="xs"
                                                leftSection={
                                                    <MantineIcon
                                                        color="green"
                                                        icon={IconCircleCheck}
                                                    />
                                                }
                                                onClick={() => onResolve()}
                                                // Walkthrough action for
                                                // manage:DashboardComments.
                                                // See scripts/scope-tours.
                                                data-tour-scope="manage:DashboardComments"
                                                data-tour-step="2"
                                                data-tour-route="/projects/:projectUuid/dashboards/:dashboardUuid/view"
                                                data-tour-label="Click Resolve"
                                                data-tour-title="Resolve a comment thread"
                                                data-tour-interactive="true"
                                                data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-dashboards"] >> [data-tour-anchor="dashboard-row"][data-tour-value="Jaffle Shop overview"] >> [data-tour-anchor="tile-comments"] >> [data-tour-anchor="comment-actions"]'
                                                data-tour-docs="explore/dashboards/interact.mdx#comment-on-a-tile:li3:1"
                                            >
                                                Resolve
                                            </Menu.Item>
                                        )}
                                        {canUnresolve && onUnresolve && (
                                            <Menu.Item
                                                p="xs"
                                                fz="xs"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconArrowBackUp}
                                                    />
                                                }
                                                onClick={() => onUnresolve()}
                                            >
                                                Unresolve
                                            </Menu.Item>
                                        )}
                                        {canRemove && (
                                            <Menu.Item
                                                p="xs"
                                                fz="xs"
                                                leftSection={
                                                    <MantineIcon
                                                        color="red"
                                                        icon={IconTrash}
                                                    />
                                                }
                                                onClick={() => onRemove()}
                                            >
                                                Delete
                                            </Menu.Item>
                                        )}
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        </Group>
                    </Group>
                    <Box
                        className={styles.commentText}
                        dangerouslySetInnerHTML={{
                            __html: sanitizedCommentTextHtml,
                        }}
                        fz="xs"
                    />
                </Grid.Col>
            </Grid>
        </Box>
    );
};
