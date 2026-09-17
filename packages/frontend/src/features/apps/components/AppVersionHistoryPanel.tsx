import {
    APP_UPGRADE_PROMPT_LABEL,
    isAppVersionInProgress,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
    Timeline,
    Title,
    Tooltip,
    UnstyledButton,
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
import {
    getVersionNarration,
    hasVersionNarration,
} from '../utils/versionNarration';
import classes from './AppVersionHistoryPanel.module.css';
import AppVersionNarration from './AppVersionNarration';
import VersionHistoryDisclosure from './VersionHistoryDisclosure';

/** A build whose version has not reached history yet. */
export type AppVersionHistoryLiveBuild = {
    claimedVersion: number | null;
    pendingPrompt: string | null;
};

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
    /** An explicit Preview button beside Restore, on top of the clickable row. */
    showPreviewButton: boolean;
    /** Rail with a dot per version beside the cards; false stacks the cards alone. */
    showTimeline?: boolean;
    /** Host-specific content under an entry's prompt. */
    renderEntryExtras?: (version: ApiAppVersionSummary) => ReactNode;
    /** The app's current thread; a rule tops the list when it has no versions yet. */
    currentThreadNumber: number | null;
};

type DotState = 'current' | 'failed' | 'building' | 'past';

/** One row of the list: a version card, or the rule where a thread ended. */
type Row = {
    key: string;
    /** null for a thread rule, which has no dot on the rail. */
    dot: DotState | null;
    node: ReactNode;
};

const RelativeTime: FC<{ at: Date }> = ({ at }) => {
    const timeAgo = useTimeAgo(at);
    return (
        <Text fz="xs" c="dimmed">
            {timeAgo}
        </Text>
    );
};

const AbsoluteTime: FC<{ at: Date }> = ({ at }) => (
    <Text fz="xs" c="dimmed">
        {format(at, 'MMM d, HH:mm')}
    </Text>
);

const MetaSeparator: FC = () => (
    <Text fz="xs" c="ldGray.4" aria-hidden>
        ·
    </Text>
);

const VersionLabel: FC<{ version: number }> = ({ version }) => (
    <Text fz="xs" c="dimmed" ff="monospace">
        v{version}
    </Text>
);

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

/** The newest ready version that was live when `version` was built. */
const getLiveVersionBefore = (
    versions: ApiAppVersionSummary[],
    version: number,
): number | null =>
    versions.reduce<number | null>(
        (latest, candidate) =>
            candidate.status === 'ready' &&
            candidate.version < version &&
            (latest === null || candidate.version > latest)
                ? candidate.version
                : latest,
        null,
    );

/**
 * Every version of a data app on a timeline, newest first and grouped by
 * thread with a rule where the agent context was cleared. Clicking a ready
 * entry pins the preview to it; earlier entries offer to restore on top.
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
    showPreviewButton,
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

    // What the preview is showing, so the highlight follows it.
    const activeVersion = viewedVersion ?? latestReadyVersion;

    const rowFor = (version: ApiAppVersionSummary): Row => {
        const isBuilding = isAppVersionInProgress(version.status);
        const isFailed = !isBuilding && version.status !== 'ready';
        const isReady = !isBuilding && !isFailed;
        const isCurrent = version.version === latestReadyVersion;
        const isActive = version.version === activeVersion;
        const label = `v${version.version}`;
        const isUpgrade = version.prompt === APP_UPGRADE_PROMPT_LABEL;
        const promptText = version.prompt || emptyPromptLabel;
        const view = () => onView(isCurrent ? null : version.version);
        const showRelativeTime = isCurrent || olderVersionTime === 'relative';
        const liveBefore = isFailed
            ? getLiveVersionBefore(versions, version.version)
            : null;
        const failureDetail = isFailed
            ? (version.statusMessage ?? version.error ?? null)
            : null;
        const dot: DotState = isBuilding
            ? 'building'
            : isFailed
              ? 'failed'
              : isCurrent
                ? 'current'
                : 'past';

        const node = (
            <Paper
                className={classes.entry}
                data-active={isActive}
                data-ready={isReady}
            >
                <UnstyledButton
                    className={classes.entryMain}
                    disabled={!isReady}
                    aria-label={`View ${label}`}
                    onClick={view}
                >
                    <Group gap="xs" wrap="nowrap">
                        {isCurrent && (
                            <Badge size="sm" color="indigo">
                                Current
                            </Badge>
                        )}
                        {isActive && !isCurrent && (
                            <Badge size="sm">Viewing</Badge>
                        )}
                        <VersionLabel version={version.version} />
                        <MetaSeparator />
                        {showRelativeTime ? (
                            <RelativeTime at={new Date(version.createdAt)} />
                        ) : (
                            <AbsoluteTime at={new Date(version.createdAt)} />
                        )}
                        {isFailed && (
                            <Text fz="xs" fw={500} c="red">
                                Build failed
                            </Text>
                        )}
                        {isBuilding && (
                            <Badge size="sm" color="indigo">
                                Building…
                            </Badge>
                        )}
                    </Group>
                    {promptText && (
                        <Text fz="sm" fw={500} className={classes.prompt}>
                            {promptText}
                        </Text>
                    )}
                    {failureDetail && (
                        <Text fz="sm" c="dimmed">
                            {failureDetail}
                        </Text>
                    )}
                    {liveBefore !== null && (
                        <Text fz="sm" c="dimmed">
                            Nothing was published, so v{liveBefore} stayed live.
                        </Text>
                    )}
                </UnstyledButton>

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

                {isReady &&
                    (!isCurrent || (showPreviewButton && !isActive)) && (
                        <Group gap="xs" wrap="nowrap">
                            {!isCurrent && (
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={
                                        <MantineIcon icon={IconHistory} />
                                    }
                                    onClick={() => onRestore(version.version)}
                                >
                                    Restore this version
                                </Button>
                            )}
                            {showPreviewButton && !isActive && (
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={<MantineIcon icon={IconEye} />}
                                    onClick={view}
                                >
                                    Preview
                                </Button>
                            )}
                        </Group>
                    )}
            </Paper>
        );

        return { key: label, dot, node };
    };

    const liveRow: Row | null = liveBuild && {
        key: 'live',
        dot: 'building',
        node: (
            <Paper className={classes.entry}>
                <Stack gap="xs">
                    <Group gap="xs" wrap="nowrap">
                        {liveBuild.claimedVersion !== null && (
                            <VersionLabel version={liveBuild.claimedVersion} />
                        )}
                        <Badge size="sm" color="indigo">
                            Building…
                        </Badge>
                    </Group>
                    {liveBuild.pendingPrompt && (
                        <Text fz="sm" fw={500} className={classes.prompt}>
                            {liveBuild.pendingPrompt}
                        </Text>
                    )}
                </Stack>
            </Paper>
        ),
    };

    const ruleRow = (key: string): Row => ({
        key,
        dot: null,
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
                        size="sm"
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
                            size="sm"
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
                    <Timeline
                        className={classes.timeline}
                        classNames={{
                            item: classes.item,
                            itemBullet: classes.bullet,
                        }}
                        bulletSize={10}
                        lineWidth={2}
                    >
                        {rows.map((row) => (
                            <Timeline.Item
                                key={row.key}
                                mod={{ state: row.dot ?? 'rule' }}
                            >
                                {row.node}
                            </Timeline.Item>
                        ))}
                    </Timeline>
                )}
                {!isEmpty && !showTimeline && (
                    <Stack gap="sm" p="md">
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
