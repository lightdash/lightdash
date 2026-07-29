import { type ApiAppVersionSummary } from '@lightdash/common';
import { Anchor, Badge, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconAlertTriangle, IconCheck, IconRestore } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppVersionHistory } from '../hooks/useAppVersionHistory';
import { useRestoreAppVersion } from '../hooks/useRestoreAppVersion';
import { type ChatMessage } from '../utils/chatMessage';
import { formatBuildDuration } from '../utils/formatBuildDuration';
import { versionsToChatMessages } from '../utils/versionsToChatMessages';
import classes from './DataAppVizVersionLog.module.css';

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

const LogRow: FC<{
    entry: LogEntry;
    /** The version every chart using this visualization renders right now. */
    isCurrent: boolean;
    onRestore: (version: number) => void;
}> = ({ entry, isCurrent, onRestore }) => {
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
                color={isCurrent ? 'violet' : 'gray'}
                className={classes.versionBadge}
            >
                {`v${entry.version}`}
            </Badge>

            <Stack gap={2} className={classes.rowBody}>
                <Prompt message={entry.request} />
                {entry.receipt && <Receipt message={entry.receipt} />}
            </Stack>

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

type Props = {
    projectUuid: string;
    /** The visualization whose history this is. */
    dataAppVizUuid: string;
};

/**
 * Every build this visualization has had, newest first — one line each, so the
 * whole session reads at a glance rather than as a scroll of bubbles.
 *
 * Restoring an older version puts its contents back on top of the timeline as a
 * new version. The newest version that finished is what every chart using this
 * visualization renders, so a restore reaches all of them.
 */
const DataAppVizVersionLog: FC<Props> = ({ projectUuid, dataAppVizUuid }) => {
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

    // Only when the failure left nothing to read — a page that fails partway
    // should not throw away the versions already on screen.
    if (isError && entries.length === 0) {
        return (
            <Text size="xs" c="dimmed" px="xs" py={6}>
                Could not load this visualization's versions.
            </Text>
        );
    }

    return (
        <>
            <Stack gap={0}>
                {entries.map((entry) => (
                    <LogRow
                        key={entry.version}
                        entry={entry}
                        isCurrent={entry.version === latestReadyVersion}
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

            {restoreTarget !== null && (
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
