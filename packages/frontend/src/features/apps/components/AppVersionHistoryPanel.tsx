import {
    APP_UPGRADE_PROMPT_LABEL,
    isAppVersionInProgress,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconEye,
    IconHistory,
    IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { Fragment, type FC, type ReactNode } from 'react';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { groupVersionsByThread } from '../utils/groupVersionsByThread';
import { type AppVersionHistoryLiveBuild } from '../utils/historyLiveBuild';
import {
    getVersionNarration,
    hasVersionNarration,
} from '../utils/versionNarration';
import classes from './AppVersionHistoryPanel.module.css';
import AppVersionNarration from './AppVersionNarration';
import VersionHistoryDisclosure from './VersionHistoryDisclosure';

export type AppVersionHistoryPanelProps = {
    /** Any order; rendered grouped by thread, newest first. */
    versions: ApiAppVersionSummary[];
    latestReadyVersion: number | null;
    /** The pinned (viewed) version; null when following the current one. */
    viewedVersion: number | null;
    onView: (version: number | null) => void;
    /** The host confirms and performs the restore. */
    onRestore: (version: number) => void;
    /** Collapse control in the header; null hides it. */
    onClose: (() => void) | null;
    /** "Back to chat" in the header for a drawer host; null hides it. */
    onBack: (() => void) | null;
    /** Live entry on top of the list; null when nothing is building. */
    liveBuild: AppVersionHistoryLiveBuild | null;
    hasEarlier: boolean;
    isFetchingEarlier: boolean;
    fetchEarlier: () => void;
    /** Stands in for an empty prompt; null renders the prompt empty. */
    emptyPromptLabel: string | null;
    /** Time shown on versions other than the current one. */
    olderVersionTime: 'relative' | 'absolute';
    /** Rail with a dot per version beside the rows; false stacks the rows alone. */
    showTimeline?: boolean;
    /** Host-specific content under an entry's prompt. */
    renderEntryExtras?: (version: ApiAppVersionSummary) => ReactNode;
    /** The app's current thread; a rule tops the list when it has no versions yet. */
    currentThreadNumber: number | null;
};

/** Colours the version pill and its dot on the rail. */
type Tone = 'live' | 'past' | 'failed' | 'building';

/** One row of the list: a version, or the rule where a thread ended. */
type Row = {
    key: string;
    /** null for a thread rule, which has no dot on the rail. */
    tone: Tone | null;
    node: ReactNode;
};

const RelativeTime: FC<{ at: Date }> = ({ at }) => {
    const timeAgo = useTimeAgo(at);
    return (
        <Text fz="xs" c="dimmed" className={classes.time}>
            {timeAgo}
        </Text>
    );
};

const AbsoluteTime: FC<{ at: Date }> = ({ at }) => (
    <Text fz="xs" c="dimmed" className={classes.time}>
        {format(at, 'MMM d, HH:mm')}
    </Text>
);

const VersionPill: FC<{
    version: number;
    tone: Tone;
    /** Shown on hover; the failure reason on a failed version. */
    tooltip: string | null;
}> = ({ version, tone, tooltip }) => {
    const pill = (
        <Text
            component="span"
            className={classes.pill}
            data-tone={tone}
            data-help={tooltip !== null || undefined}
        >
            v{version}
        </Text>
    );
    return tooltip === null ? (
        pill
    ) : (
        <Tooltip label={tooltip} multiline maw={280}>
            {pill}
        </Tooltip>
    );
};

const VersionBuildDetails: FC<{ version: ApiAppVersionSummary }> = ({
    version,
}) => {
    const narration = getVersionNarration(version.statusHistory);
    if (!hasVersionNarration(narration)) return null;

    return (
        <VersionHistoryDisclosure
            label="Build details"
            ariaLabel={`Build details for v${version.version}`}
            summary={null}
        >
            <AppVersionNarration narration={narration} isLive={false} />
        </VersionHistoryDisclosure>
    );
};

const ThreadRule: FC = () => (
    <Divider
        className={classes.threadRule}
        label="Agent context cleared"
        labelPosition="center"
    />
);

/**
 * Every version of a data app on a timeline, newest first and grouped by
 * thread with a rule where the agent context was cleared. Rows are
 * borderless; the pill carries the build state, and Restore and Preview show
 * on hover, with Previewing staying visible on the pinned version.
 */
const AppVersionHistoryPanel: FC<AppVersionHistoryPanelProps> = ({
    versions,
    latestReadyVersion,
    viewedVersion,
    onView,
    onRestore,
    onClose,
    onBack,
    liveBuild,
    hasEarlier,
    isFetchingEarlier,
    fetchEarlier,
    emptyPromptLabel,
    olderVersionTime,
    showTimeline = true,
    renderEntryExtras,
    currentThreadNumber,
}) => {
    const groups = groupVersionsByThread(versions);
    const isEmpty = groups.length === 0 && liveBuild === null;
    const isCurrentThreadEmpty =
        groups.length > 0 &&
        currentThreadNumber !== null &&
        currentThreadNumber > groups[0].threadNumber;

    const rowFor = (version: ApiAppVersionSummary): Row => {
        const isBuilding = isAppVersionInProgress(version.status);
        const isFailed = !isBuilding && version.status !== 'ready';
        const isReady = !isBuilding && !isFailed;
        const isCurrent = version.version === latestReadyVersion;
        const isPreviewing = version.version === viewedVersion;
        // The current version offers Preview only while another one is pinned.
        const isPinnedElsewhere = viewedVersion !== null && !isPreviewing;
        const label = `v${version.version}`;
        const isUpgrade = version.prompt === APP_UPGRADE_PROMPT_LABEL;
        const promptText = version.prompt || emptyPromptLabel;
        const showRelativeTime = isCurrent || olderVersionTime === 'relative';
        const tone: Tone = isBuilding
            ? 'building'
            : isFailed
              ? 'failed'
              : isCurrent
                ? 'live'
                : 'past';
        const failureReason = isFailed
            ? (version.statusMessage ??
              version.error ??
              'Build failed, nothing was published')
            : null;

        const node = (
            <Box className={classes.entry} data-live={isCurrent || undefined}>
                <Group gap={7} wrap="nowrap" className={classes.meta}>
                    <VersionPill
                        version={version.version}
                        tone={tone}
                        tooltip={failureReason}
                    />
                    {showRelativeTime ? (
                        <RelativeTime at={new Date(version.createdAt)} />
                    ) : (
                        <AbsoluteTime at={new Date(version.createdAt)} />
                    )}
                    {isBuilding && (
                        <Text fz="xs" c="dimmed">
                            Building…
                        </Text>
                    )}
                    {isReady && (!isCurrent || isPinnedElsewhere) && (
                        <Group
                            gap={4}
                            wrap="nowrap"
                            className={classes.actions}
                            data-visible={isPreviewing || undefined}
                        >
                            {!isCurrent && (
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="gray"
                                    className={classes.action}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconHistory}
                                            size={12}
                                        />
                                    }
                                    onClick={() => onRestore(version.version)}
                                >
                                    Restore
                                </Button>
                            )}
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                className={classes.action}
                                data-previewing={isPreviewing || undefined}
                                leftSection={
                                    <MantineIcon icon={IconEye} size={12} />
                                }
                                onClick={() =>
                                    onView(
                                        isPreviewing || isCurrent
                                            ? null
                                            : version.version,
                                    )
                                }
                            >
                                {isPreviewing ? 'Previewing' : 'Preview'}
                            </Button>
                        </Group>
                    )}
                </Group>
                {promptText && (
                    <Text fz="sm" className={classes.prompt}>
                        {promptText}
                    </Text>
                )}

                {renderEntryExtras?.(version)}

                {!isBuilding && <VersionBuildDetails version={version} />}

                {isReady && isUpgrade && version.statusMessage && (
                    <Box className={classes.upgradeSummary}>
                        <Text fz="xs" fw={500} mb="xxs">
                            Upgrade summary
                        </Text>
                        <AiMarkdown className={classes.upgradeSummaryMarkdown}>
                            {version.statusMessage}
                        </AiMarkdown>
                    </Box>
                )}
            </Box>
        );

        return { key: label, tone, node };
    };

    const liveRow: Row | null = liveBuild && {
        key: 'live',
        tone: 'building',
        node: (
            <Box className={classes.entry}>
                <Group gap={7} wrap="nowrap" className={classes.meta}>
                    {liveBuild.claimedVersion !== null && (
                        <VersionPill
                            version={liveBuild.claimedVersion}
                            tone="building"
                            tooltip={null}
                        />
                    )}
                    <Text fz="xs" c="dimmed">
                        Building…
                    </Text>
                </Group>
                {liveBuild.pendingPrompt && (
                    <Text fz="sm" className={classes.prompt}>
                        {liveBuild.pendingPrompt}
                    </Text>
                )}
            </Box>
        ),
    };

    const ruleRow = (key: string): Row => ({
        key,
        tone: null,
        node: <ThreadRule />,
    });

    const rows: Row[] = [
        ...(liveRow ? [liveRow] : []),
        ...(isCurrentThreadEmpty ? [ruleRow('rule-current')] : []),
        ...groups.flatMap((group, index) => [
            ...(index > 0 ? [ruleRow(`rule-${group.threadUuid}`)] : []),
            ...group.versions.map(rowFor),
        ]),
    ];

    return (
        <Box
            className={classes.panel}
            component="aside"
            aria-label="Version history"
        >
            <Box className={classes.header}>
                <Title order={5}>Version history</Title>
                {onBack && (
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={onBack}
                    >
                        Back to chat
                    </Button>
                )}
                {onClose && (
                    <Tooltip label="Collapse version history">
                        <ActionIcon
                            size="xs"
                            aria-label="Collapse version history"
                            onClick={onClose}
                        >
                            <MantineIcon
                                icon={IconLayoutSidebarRightCollapse}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Box>

            <Box className={classes.list}>
                {!isEmpty && showTimeline && (
                    <Box component="ul" className={classes.timeline}>
                        {rows.map((row) => (
                            <Box
                                component="li"
                                key={row.key}
                                className={classes.item}
                            >
                                <Box
                                    component="span"
                                    className={classes.rail}
                                    aria-hidden
                                >
                                    {row.tone !== null && (
                                        <Box
                                            component="span"
                                            className={classes.node}
                                            data-tone={row.tone}
                                        />
                                    )}
                                    <Box
                                        component="span"
                                        className={classes.spine}
                                    />
                                </Box>
                                <Box className={classes.itemBody}>
                                    {row.node}
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}
                {!isEmpty && !showTimeline && (
                    <Stack gap={0} p="md">
                        {rows.map((row) => (
                            <Fragment key={row.key}>{row.node}</Fragment>
                        ))}
                    </Stack>
                )}
                {isEmpty && (
                    <Paper variant="dotted" m="md" p="md">
                        <Text fz="sm" c="dimmed" ta="center">
                            No versions yet
                        </Text>
                    </Paper>
                )}
                {hasEarlier && (
                    <Group justify="center" pb="md">
                        <Button
                            size="xs"
                            variant="subtle"
                            loading={isFetchingEarlier}
                            onClick={fetchEarlier}
                        >
                            Load earlier versions
                        </Button>
                    </Group>
                )}
            </Box>
        </Box>
    );
};

export default AppVersionHistoryPanel;
