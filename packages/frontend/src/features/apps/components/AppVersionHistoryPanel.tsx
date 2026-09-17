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
    Paper,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { Fragment, type FC, type ReactNode } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { getAppVersionFailureMessage } from '../getAppVersionFailureMessage';
import { groupVersionsByThread } from '../utils/groupVersionsByThread';
import {
    getVersionNarration,
    hasVersionNarration,
} from '../utils/versionNarration';
import { getVersionAuthorName } from '../utils/versionsToChatMessages';
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
    /** Host-specific content under an entry's prompt. */
    renderEntryExtras?: (version: ApiAppVersionSummary) => ReactNode;
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
            <Text fz="xs" c="dimmed" truncate="end">
                {name}
            </Text>
        </>
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

/**
 * Every version of a data app, newest first and grouped by thread with a
 * divider where the agent context was cleared. Clicking a ready entry pins
 * the preview to it; earlier entries offer to restore on top.
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
    renderEntryExtras,
}) => {
    const groups = groupVersionsByThread(versions);
    const isEmpty = groups.length === 0 && liveBuild === null;

    // What the preview is showing, so the highlight follows it.
    const activeVersion = viewedVersion ?? latestReadyVersion;

    const entryFor = (version: ApiAppVersionSummary) => {
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
                    onClick={view}
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
                            {showRelativeTime ? (
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
                    {promptText && (
                        <Text fz="sm" lh={1.45} c="ldGray.8">
                            {promptText}
                        </Text>
                    )}
                </UnstyledButton>

                {isFailed && (
                    <Box className={classes.failure}>
                        <Text fz="xs" lh={1.4} c="red.7">
                            {getAppVersionFailureMessage(version)}
                        </Text>
                    </Box>
                )}

                {renderEntryExtras?.(version)}

                {!isBuilding && <VersionBuildDetails version={version} />}

                {isReady && isUpgrade && version.statusMessage && (
                    <Box className={classes.upgradeSummary}>
                        <Text fz="xs" fw={600} c="blue.8" mb={4}>
                            Upgrade summary
                        </Text>
                        <AiMarkdown className={classes.upgradeSummaryMarkdown}>
                            {version.statusMessage}
                        </AiMarkdown>
                    </Box>
                )}

                <Box className={classes.row}>
                    <AuthorLine version={version} />
                    {isReady && (
                        <Box className={classes.actions}>
                            {showPreviewButton && !isActive && (
                                <Button
                                    size="compact-xs"
                                    radius="xl"
                                    variant="default"
                                    onClick={view}
                                >
                                    Preview
                                </Button>
                            )}
                            {!isCurrent && (
                                <Button
                                    size="compact-xs"
                                    radius="xl"
                                    variant="default"
                                    onClick={() => onRestore(version.version)}
                                >
                                    Restore
                                </Button>
                            )}
                        </Box>
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
                <Title order={3} fz="sm" fw={600}>
                    Version history
                </Title>
                {onBack && (
                    <Button
                        size="compact-xs"
                        variant="subtle"
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
                {liveBuild && (
                    <Box className={classes.entry}>
                        <Box className={classes.row}>
                            <Text
                                className={classes.versionLabel}
                                span
                                data-state="building"
                            >
                                {liveBuild.claimedVersion === null
                                    ? 'Building…'
                                    : `v${liveBuild.claimedVersion}`}
                            </Text>
                            {liveBuild.claimedVersion !== null && (
                                <Badge size="xs" variant="outline" color="blue">
                                    Building…
                                </Badge>
                            )}
                        </Box>
                        {liveBuild.pendingPrompt && (
                            <Text fz="sm" lh={1.45} c="ldGray.8">
                                {liveBuild.pendingPrompt}
                            </Text>
                        )}
                    </Box>
                )}
                {groups.map((group, index) => (
                    <Fragment key={group.threadUuid}>
                        {index > 0 && (
                            <Divider
                                className={classes.threadDivider}
                                label="Agent context cleared"
                                labelPosition="center"
                            />
                        )}
                        {group.versions.map(entryFor)}
                    </Fragment>
                ))}
                {isEmpty && (
                    <Paper variant="dotted" m="md" p="md">
                        <Text fz="sm" c="dimmed" ta="center">
                            No versions yet
                        </Text>
                    </Paper>
                )}
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
        </Box>
    );
};

export default AppVersionHistoryPanel;
