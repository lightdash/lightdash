import { Badge, Group, Text, Tooltip } from '@mantine-8/core';
import { IconEye } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import classes from './ChatBubbleMeta.module.css';

type VersionInfo = {
    version: number;
    /** True when the preview iframe is currently showing this version. */
    isActive: boolean;
    /** Click handler — pin the preview to this version. Required so a future
     *  caller can't silently render a dead chip; ignored when `isActive`. */
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
     * tied to a specific ready version. The chip itself is the click
     * target: clicking the (inactive) chip pins the preview to that
     * version. Active chip renders in indigo with an eye icon and is
     * non-interactive.
     *
     * Further per-version actions (e.g. "Restore as new version") live
     * elsewhere on the bubble — not in this meta row.
     */
    version?: VersionInfo;
};

/**
 * Header row rendered inside a chat bubble. The left slot holds the sender
 * name (user bubbles) or a clickable version badge (assistant replies tied
 * to a ready version); the right slot holds the relative timestamp with a
 * tooltip for the absolute date.
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
            {version &&
                (version.isActive ? (
                    <Badge
                        size="sm"
                        variant="light"
                        color="indigo"
                        leftSection={<MantineIcon icon={IconEye} size={10} />}
                    >
                        v{version.version}
                    </Badge>
                ) : (
                    <Tooltip
                        position="top-start"
                        fz="xs"
                        offset={2}
                        label="Preview this version"
                    >
                        <Badge
                            size="sm"
                            variant="light"
                            color="gray"
                            component="button"
                            type="button"
                            onClick={version.onPreview}
                            className={classes.versionChip}
                        >
                            v{version.version}
                        </Badge>
                    </Tooltip>
                ))}
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
        </Group>
    );
};

export default ChatBubbleMeta;
