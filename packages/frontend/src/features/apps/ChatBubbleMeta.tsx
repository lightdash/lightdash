import { ActionIcon, Badge, Group, Menu, Text, Tooltip } from '@mantine-8/core';
import { IconDots, IconEye } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import classes from './ChatBubbleMeta.module.css';

type VersionInfo = {
    version: number;
    /** True when the preview iframe is currently showing this version. */
    isActive: boolean;
    /** Click handler for the kebab menu's "Preview this version" item.
     *  Required even when `isActive` — the menu item is disabled in that
     *  case, but a missing handler would be a wiring bug, not a valid
     *  state, so the type stays non-optional. */
    onPreview: () => void;
};

type Props = {
    timestamp: Date;
    /**
     * Sender name to show on the left of the header. Pass `null` to render
     * just the timestamp (or the version chip, if provided).
     */
    userName: string | null;
    /**
     * Version chip rendered on the left of the row for assistant replies
     * tied to a specific ready version. The chip is a non-interactive
     * label — actions live in the kebab menu on the right (`⋯`). For now
     * the only entry is "Preview this version"; "Restore as new version"
     * is the next thing to add (see GLITCH-443).
     */
    version?: VersionInfo;
};

/**
 * Header row rendered inside a chat bubble. The left slot holds the sender
 * name (user bubbles) or a clickable version badge (assistant replies tied
 * to a ready version); the right slot holds the relative timestamp with a
 * tooltip for the absolute date, optionally followed by a version-actions
 * kebab menu.
 */
const ChatBubbleMeta: FC<Props> = ({ timestamp, userName, version }) => {
    const timeAgo = useTimeAgo(timestamp);
    // Only user bubbles split (name left, timestamp right) — that pattern
    // anchors the sender's name to the bubble edge. Assistant bubbles keep
    // the version chip and timestamp adjacent on the left so a short chip
    // doesn't leave the timestamp floating mid-row.
    const justify = userName ? 'space-between' : 'flex-start';
    return (
        <Group
            gap="xs"
            wrap="nowrap"
            justify={justify}
            className={classes.meta}
        >
            {userName && (
                <Text fz="xs" fw={600} className={classes.name} truncate>
                    {userName}
                </Text>
            )}
            {version && (
                <Badge
                    size="sm"
                    variant="light"
                    color={version.isActive ? 'indigo' : 'gray'}
                    leftSection={
                        version.isActive ? (
                            <MantineIcon icon={IconEye} size={10} />
                        ) : undefined
                    }
                >
                    v{version.version}
                </Badge>
            )}
            <Tooltip
                position={userName ? 'top-end' : 'top-start'}
                fz="xs"
                offset={2}
                label={dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')}
            >
                <Text fz="10px" c="dimmed" className={classes.time}>
                    {timeAgo}
                </Text>
            </Tooltip>
            {version && (
                <Menu
                    shadow="md"
                    position="bottom-end"
                    withinPortal
                    withArrow
                    arrowPosition="center"
                >
                    <Menu.Target>
                        <ActionIcon
                            variant="subtle"
                            size="xs"
                            color="ldGray.6"
                            className={classes.versionMenuTrigger}
                            aria-label="Version actions"
                        >
                            <MantineIcon icon={IconDots} size={12} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconEye} size={14} />
                            }
                            disabled={version.isActive}
                            onClick={version.onPreview}
                        >
                            Preview this version
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            )}
        </Group>
    );
};

export default ChatBubbleMeta;
