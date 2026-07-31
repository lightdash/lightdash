import {
    isAppVersionInProgress,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { Anchor, Badge, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconCheck, IconRestore } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppVersionHistory } from '../hooks/useAppVersionHistory';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import { useRestoreAppVersion } from '../hooks/useRestoreAppVersion';
import { type ChatMessage } from '../utils/chatMessage';
import { formatBuildDuration } from '../utils/formatBuildDuration';
import { versionsToChatMessages } from '../utils/versionsToChatMessages';
import classes from './DataAppVizVersionLog.module.css';
import LoadingDots from './LoadingDots';

/** One exchange: what was asked for, and what the build made of it. */
type LogEntry = {
    version: number;
    status: ApiAppVersionSummary['status'];
    request: ChatMessage;
    /** Null while the version is still building — it has no outcome yet. */
    receipt: ChatMessage | null;
};

const Receipt: FC<{ message: ChatMessage }> = ({ message }) => {
    const timeAgo = useTimeAgo(message.timestamp);

    if (message.status === 'error') {
        return (
            <Group gap={4} wrap="nowrap">
                <MantineIcon icon={IconAlertTriangle} size={12} color="red.6" />
                <Text size="xs" c="red.7" lineClamp={1}>
                    {message.content}
                </Text>
            </Group>
        );
    }

    const built =
        message.durationMs === null
            ? 'Built'
            : `Built in ${formatBuildDuration(message.durationMs)}`;
    return (
        <Group gap={4} wrap="nowrap">
            <MantineIcon icon={IconCheck} size={12} color="green.7" />
            <Text size="xs" c="dimmed">
                {`${built} · ${timeAgo}`}
            </Text>
        </Group>
    );
};

const Prompt: FC<{ message: ChatMessage }> = ({ message }) =>
    message.content ? (
        <Text size="xs" lineClamp={1} title={message.content}>
            {message.content}
        </Text>
    ) : (
        <Text size="xs" c="dimmed" fs="italic">
            Uploaded from source
        </Text>
    );

const Building: FC<{ elapsed: string | null }> = ({ elapsed }) => (
    <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed">
            Building
        </Text>
        <LoadingDots />
        {elapsed && (
            <Text size="xs" c="dimmed" fw={500}>
                {elapsed}
            </Text>
        )}
    </Group>
);

const LogRow: FC<{
    entry: LogEntry;
    /** The version every chart using this visualization renders right now. */
    isCurrent: boolean;
    /** Ticking clock, when this row is the build in flight. */
    elapsed: string | null;
    onCancel: (() => void) | null;
    onRestore: (version: number) => void;
}> = ({ entry, isCurrent, elapsed, onCancel, onRestore }) => {
    // A version the poller has written but not yet finished — any of the seven
    // stages before it lands. Its own row reports the progress, so the build
    // never needs a second one.
    const isBuilding = isAppVersionInProgress(entry.status);
    return (
        <Group
            className={classes.row}
            gap="xs"
            wrap="nowrap"
            align="flex-start"
            data-testid={`version-log-row-${entry.version}`}
        >
            <Badge
                size="xs"
                variant="light"
                color={isCurrent || isBuilding ? 'violet' : 'gray'}
                className={classes.versionBadge}
            >
                {`v${entry.version}`}
            </Badge>

            <Stack gap={2} className={classes.rowBody}>
                <Prompt message={entry.request} />
                {isBuilding ? (
                    <Building elapsed={elapsed} />
                ) : (
                    entry.receipt && <Receipt message={entry.receipt} />
                )}
            </Stack>

            {isBuilding && onCancel && (
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    c="dimmed"
                    className={classes.rowAction}
                    onClick={onCancel}
                >
                    Cancel
                </Anchor>
            )}
            {isCurrent && (
                <Text size="xs" c="dimmed" className={classes.rowAction}>
                    current
                </Text>
            )}
            {!isCurrent && entry.status === 'ready' && (
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    className={classes.rowAction}
                    onClick={() => onRestore(entry.version)}
                >
                    Restore
                </Anchor>
            )}
        </Group>
    );
};

/**
 * The request in flight, shown from the moment it is sent — its version log
 * row is written by the build itself, not by history.
 */
const LiveRow: FC<{
    build: DataAppVizBuildState;
    elapsed: string | null;
    onCancel: (() => void) | null;
}> = ({ build, elapsed, onCancel }) => (
    <Group className={classes.row} gap="xs" wrap="nowrap" align="flex-start">
        <Badge
            size="xs"
            variant="light"
            color="violet"
            className={classes.versionBadge}
        >
            {build.claimedVersion === null ? '···' : `v${build.claimedVersion}`}
        </Badge>

        <Stack gap={2} className={classes.rowBody}>
            <Text size="xs" lineClamp={1}>
                {build.pendingPrompt}
            </Text>
            <Building elapsed={elapsed} />
        </Stack>

        {onCancel && (
            <Anchor
                component="button"
                type="button"
                size="xs"
                c="dimmed"
                className={classes.rowAction}
                onClick={onCancel}
            >
                Cancel
            </Anchor>
        )}
    </Group>
);

/** A send that never became a version: nothing to receipt, only to retry. */
const FailedRow: FC<{ error: string; retry: (() => void) | null }> = ({
    error,
    retry,
}) => (
    <Group className={classes.row} gap="xs" wrap="nowrap" align="flex-start">
        <MantineIcon
            icon={IconAlertTriangle}
            size={12}
            color="red.6"
            className={classes.versionBadge}
        />
        <Stack gap={2} className={classes.rowBody}>
            <Text size="xs" c="red.7">
                {error}
            </Text>
            <Text size="xs" c="dimmed">
                Your query and chart are untouched.
            </Text>
        </Stack>
        {retry && (
            <Anchor
                component="button"
                type="button"
                size="xs"
                className={classes.rowAction}
                onClick={retry}
            >
                Retry
            </Anchor>
        )}
    </Group>
);

type Props = {
    projectUuid: string;
    /** The visualization whose history this is; null before one exists. */
    dataAppVizUuid: string | null;
    build: DataAppVizBuildState;
    /** Ticking `0:12` while a build runs; null when nothing is running. */
    elapsed: string | null;
    onCancelBuild: (() => void) | null;
};

/**
 * Every build this visualization has had, newest first — one line each, so the
 * whole session reads at a glance rather than as a scroll of bubbles.
 *
 * Restoring an older version puts its contents back on top of the timeline as a
 * new version. The newest version that finished is what every chart using this
 * visualization renders, so a restore reaches all of them.
 */
const DataAppVizVersionLog: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    build,
    elapsed,
    onCancelBuild,
}) => {
    const {
        versions,
        latestReadyVersion,
        hasEarlier,
        isLoading,
        isError,
        isFetchingEarlier,
        fetchEarlier,
    } = useAppVersionHistory(projectUuid, dataAppVizUuid);
    // Which version the user is about to restore; null while nothing is asked.
    const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
    const {
        mutate: restoreVersion,
        isLoading: isRestoring,
        error: restoreError,
        reset: resetRestore,
    } = useRestoreAppVersion();

    const entries = useMemo<LogEntry[]>(
        () =>
            [...versions]
                .sort((a, b) => b.version - a.version)
                .map((version) => {
                    // Per version, so each row is exactly the pair the
                    // generator's thread renders for it.
                    const [request, receipt] = versionsToChatMessages([
                        version,
                    ]);
                    return {
                        version: version.version,
                        status: version.status,
                        request,
                        receipt: receipt ?? null,
                    };
                }),
        [versions],
    );

    if (isLoading) {
        return (
            <Group justify="center" p="md">
                <Loader size="sm" />
            </Group>
        );
    }

    // The build writes its own row until the version it claimed reaches
    // history, where the same request appears as a stored prompt.
    const isClaimedInHistory =
        build.claimedVersion !== null &&
        versions.some((v) => v.version === build.claimedVersion);

    // Only when the failure left nothing to read — a page that fails partway
    // should not throw away the versions already on screen, and a build in
    // flight still has a row of its own to write.
    if (isError && entries.length === 0 && !build.isBuilding && !build.error) {
        return (
            <Text size="xs" c="dimmed" px="xs" py={6}>
                Could not load this visualization's versions.
            </Text>
        );
    }

    return (
        <>
            <Stack gap={0}>
                {build.isBuilding && !isClaimedInHistory && (
                    <LiveRow
                        build={build}
                        elapsed={elapsed}
                        onCancel={onCancelBuild}
                    />
                )}

                {build.error && (
                    <FailedRow error={build.error} retry={build.retry} />
                )}

                {entries.map((entry) => (
                    <LogRow
                        key={entry.version}
                        entry={entry}
                        isCurrent={entry.version === latestReadyVersion}
                        elapsed={elapsed}
                        onCancel={
                            entry.version === build.claimedVersion
                                ? onCancelBuild
                                : null
                        }
                        onRestore={setRestoreTarget}
                    />
                ))}

                {hasEarlier && (
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        px="xs"
                        py={6}
                        disabled={isFetchingEarlier}
                        onClick={fetchEarlier}
                    >
                        {isFetchingEarlier ? 'Loading…' : 'Load earlier builds'}
                    </Anchor>
                )}
            </Stack>

            {restoreTarget !== null && dataAppVizUuid && (
                <MantineModal
                    opened
                    onClose={() => {
                        if (isRestoring) return;
                        setRestoreTarget(null);
                        resetRestore();
                    }}
                    title={`Restore version ${restoreTarget}?`}
                    icon={IconRestore}
                    confirmLabel="Restore version"
                    cancelDisabled={isRestoring}
                    confirmLoading={isRestoring}
                    onConfirm={() =>
                        restoreVersion(
                            {
                                projectUuid,
                                appUuid: dataAppVizUuid,
                                version: restoreTarget,
                            },
                            { onSuccess: () => setRestoreTarget(null) },
                        )
                    }
                >
                    <Stack gap="sm">
                        <Text fz="sm">
                            This adds a new version on top that duplicates
                            version {restoreTarget}. Every chart using this
                            visualization follows the latest version, so they
                            will all show it — and any chart bound to a field
                            that version {restoreTarget} does not declare will
                            lose that binding.
                        </Text>
                        {restoreError && (
                            <Callout variant="danger">
                                {restoreError.error?.message ??
                                    'Failed to restore version.'}
                            </Callout>
                        )}
                    </Stack>
                </MantineModal>
            )}
        </>
    );
};

export default DataAppVizVersionLog;
