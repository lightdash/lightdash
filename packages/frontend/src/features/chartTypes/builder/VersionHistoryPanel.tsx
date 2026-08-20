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
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconX } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useState, type FC } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import AppVersionNarration from '../../apps/components/AppVersionNarration';
import { getAppVersionFailureMessage } from '../../apps/getAppVersionFailureMessage';
import {
    getVersionNarration,
    hasVersionNarration,
} from '../../apps/utils/versionNarration';
import { getVersionAuthorName } from '../../apps/utils/versionsToChatMessages';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import RestoreVersionModal from './RestoreVersionModal';
import classes from './VersionHistoryPanel.module.css';

type Props = {
    projectUuid: string;
    appUuid: string;
    /** Newest first, as `useAppVersionHistory` returns them. */
    versions: ApiAppVersionSummary[];
    latestReadyVersion: number | null;
    /** The pinned (viewed) version; null when following the current one. */
    viewedVersion: number | null;
    onView: (version: number | null) => void;
    onClose: () => void;
    build: DataAppVizBuildState;
    hasEarlier: boolean;
    isFetchingEarlier: boolean;
    fetchEarlier: () => void;
};

const RelativeTime: FC<{ at: Date }> = ({ at }) => {
    const timeAgo = useTimeAgo(at);
    return (
        <Text fz={11} c="dimmed">
            {timeAgo}
        </Text>
    );
};

const AbsoluteTime: FC<{ at: Date }> = ({ at }) => (
    <Text fz={11} c="dimmed">
        {format(at, 'MMM d, HH:mm')}
    </Text>
);

const AuthorLine: FC<{ version: ApiAppVersionSummary }> = ({ version }) => {
    const name = getVersionAuthorName(version);
    if (!name) return null;
    return (
        <>
            <LightdashUserAvatar
                size={18}
                name={name}
                userUuid={version.createdByUser?.userUuid}
            />
            <Text fz={11} c="dimmed" truncate="end">
                {name}
            </Text>
        </>
    );
};

const VersionBuildDetails: FC<{ version: ApiAppVersionSummary }> = ({
    version,
}) => {
    const [open, setOpen] = useState(false);
    const narration = getVersionNarration(version.statusHistory);

    if (!hasVersionNarration(narration)) return null;

    return (
        <Box className={classes.buildDetails}>
            <UnstyledButton
                className={classes.buildDetailsToggle}
                aria-label={`Build details for v${version.version}`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={12}
                    className={classes.buildDetailsChevron}
                    data-open={open || undefined}
                />
                <Text fz={11} fw={600}>
                    Build details
                </Text>
            </UnstyledButton>
            {open && (
                <AppVersionNarration
                    narration={narration}
                    isLive={false}
                    className={classes.buildDetailsNarration}
                />
            )}
        </Box>
    );
};

/**
 * The version timeline as a side panel, newest first. Clicking a ready entry
 * pins the preview to it; each earlier entry offers to restore it on top.
 */
const VersionHistoryPanel: FC<Props> = ({
    projectUuid,
    appUuid,
    versions,
    latestReadyVersion,
    viewedVersion,
    onView,
    onClose,
    build,
    hasEarlier,
    isFetchingEarlier,
    fetchEarlier,
}) => {
    const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

    const ordered = [...versions].sort((a, b) => b.version - a.version);
    // The build writes its own entry until the version it claimed reaches
    // history, where it shows up as an in-progress version of its own.
    const isClaimedInHistory =
        build.claimedVersion !== null &&
        versions.some((v) => v.version === build.claimedVersion);
    const showLiveEntry = build.isBuilding && !isClaimedInHistory;

    // What the preview is showing, so the highlight follows the chart.
    const activeVersion = viewedVersion ?? latestReadyVersion;

    const entryFor = (version: ApiAppVersionSummary) => {
        const isBuilding = isAppVersionInProgress(version.status);
        const isFailed = !isBuilding && version.status !== 'ready';
        const isReady = !isBuilding && !isFailed;
        const isCurrent = version.version === latestReadyVersion;
        const isActive = version.version === activeVersion;
        const label = `v${version.version}`;
        const isUpgrade = version.prompt === APP_UPGRADE_PROMPT_LABEL;

        return (
            <Box
                key={version.version}
                className={classes.entry}
                data-active={isActive}
            >
                <UnstyledButton
                    className={classes.entryMain}
                    disabled={!isReady}
                    aria-label={`View ${label}`}
                    onClick={() => onView(isCurrent ? null : version.version)}
                >
                    <Box className={classes.row}>
                        <Text
                            className={classes.versionLabel}
                            span
                            data-state={
                                isBuilding
                                    ? 'building'
                                    : isFailed
                                      ? 'failed'
                                      : isActive
                                        ? 'active'
                                        : undefined
                            }
                        >
                            {label}
                        </Text>
                        {isCurrent && (
                            <Badge size="xs" variant="outline" color="blue">
                                Current
                            </Badge>
                        )}
                        {isActive && !isCurrent && (
                            <Badge size="xs" variant="outline" color="blue">
                                Viewing
                            </Badge>
                        )}
                        {isFailed && (
                            <Badge size="xs" variant="outline" color="red">
                                Failed
                            </Badge>
                        )}
                        {isBuilding && (
                            <Badge size="xs" variant="outline" color="blue">
                                Building…
                            </Badge>
                        )}
                        <Box ml="auto">
                            {isCurrent ? (
                                <RelativeTime
                                    at={new Date(version.createdAt)}
                                />
                            ) : (
                                <AbsoluteTime
                                    at={new Date(version.createdAt)}
                                />
                            )}
                        </Box>
                    </Box>
                    <Text fz={13} lh={1.45} c="ldGray.8">
                        {version.prompt || 'Uploaded from source'}
                    </Text>
                </UnstyledButton>

                {isFailed && (
                    <Box className={classes.failure}>
                        <Text fz={11} lh={1.4} c="red.7">
                            {getAppVersionFailureMessage(version)}
                        </Text>
                    </Box>
                )}

                {!isBuilding && <VersionBuildDetails version={version} />}

                {isReady && isUpgrade && version.statusMessage && (
                    <Box className={classes.upgradeSummary}>
                        <Text fz={11} fw={600} c="blue.8" mb={4}>
                            Upgrade summary
                        </Text>
                        <AiMarkdown className={classes.upgradeSummaryMarkdown}>
                            {version.statusMessage}
                        </AiMarkdown>
                    </Box>
                )}

                <Box className={classes.row}>
                    <AuthorLine version={version} />
                    {isReady && !isCurrent && (
                        <Button
                            className={classes.restore}
                            size="compact-xs"
                            radius="xl"
                            variant="default"
                            onClick={() => setRestoreTarget(version.version)}
                        >
                            Restore
                        </Button>
                    )}
                </Box>
            </Box>
        );
    };

    return (
        <Box
            className={classes.panel}
            component="aside"
            aria-label="Version history"
        >
            <Box className={classes.header}>
                <Text className={classes.title} span>
                    Version history
                </Text>
                <Tooltip withArrow label="Close history">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Close history"
                        onClick={onClose}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Box>

            <Box className={classes.list}>
                {showLiveEntry && (
                    <Box className={classes.entry}>
                        <Box className={classes.row}>
                            <Text
                                className={classes.versionLabel}
                                span
                                data-state="building"
                            >
                                {build.claimedVersion === null
                                    ? 'Building…'
                                    : `v${build.claimedVersion}`}
                            </Text>
                            {build.claimedVersion !== null && (
                                <Badge size="xs" variant="outline" color="blue">
                                    Building…
                                </Badge>
                            )}
                        </Box>
                        {build.pendingPrompt && (
                            <Text fz={13} lh={1.45} c="ldGray.8">
                                {build.pendingPrompt}
                            </Text>
                        )}
                    </Box>
                )}
                {ordered.map(entryFor)}
                {hasEarlier && (
                    <Box className={classes.earlier}>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            loading={isFetchingEarlier}
                            onClick={fetchEarlier}
                        >
                            Load earlier versions
                        </Button>
                    </Box>
                )}
            </Box>

            {restoreTarget !== null && (
                <RestoreVersionModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    version={restoreTarget}
                    onClose={() => setRestoreTarget(null)}
                />
            )}
        </Box>
    );
};

export default VersionHistoryPanel;
