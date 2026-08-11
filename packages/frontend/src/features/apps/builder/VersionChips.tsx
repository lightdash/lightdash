import {
    isAppVersionInProgress,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import { Box, Button, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useState, type FC } from 'react';
import { getAppVersionFailureMessage } from '../getAppVersionFailureMessage';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import RestoreVersionModal from './RestoreVersionModal';
import classes from './VersionChips.module.css';

type Props = {
    projectUuid: string;
    appUuid: string;
    /** Newest first, as `useAppVersionHistory` returns them. */
    versions: ApiAppVersionSummary[];
    latestReadyVersion: number | null;
    /** The pinned (viewed) version; null when following the current one. */
    viewedVersion: number | null;
    onView: (version: number | null) => void;
    build: DataAppVizBuildState;
    hasEarlier: boolean;
    isFetchingEarlier: boolean;
    fetchEarlier: () => void;
};

/**
 * The version timeline as a row of chips, oldest to newest. Clicking a ready
 * chip pins the preview to it; a pill underneath offers restore or return.
 */
const VersionChips: FC<Props> = ({
    projectUuid,
    appUuid,
    versions,
    latestReadyVersion,
    viewedVersion,
    onView,
    build,
    hasEarlier,
    isFetchingEarlier,
    fetchEarlier,
}) => {
    const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

    const ordered = [...versions].sort((a, b) => a.version - b.version);
    // The build writes its own chip until the version it claimed reaches
    // history, where it shows up as an in-progress version of its own.
    const isClaimedInHistory =
        build.claimedVersion !== null &&
        versions.some((v) => v.version === build.claimedVersion);
    const showLiveChip = build.isBuilding && !isClaimedInHistory;

    const chipFor = (version: ApiAppVersionSummary) => {
        const isBuilding = isAppVersionInProgress(version.status);
        const isCurrent = version.version === latestReadyVersion;
        const isViewing = version.version === viewedVersion;
        const isFailed = !isBuilding && version.status !== 'ready';

        if (isBuilding) {
            return (
                <Box
                    key={version.version}
                    component="span"
                    className={classes.chip}
                    data-state="building"
                >
                    {`v${version.version} · building…`}
                </Box>
            );
        }
        if (isFailed) {
            return (
                <Tooltip
                    key={version.version}
                    label={getAppVersionFailureMessage(version)}
                >
                    <Box
                        component="span"
                        className={classes.chip}
                        data-state="failed"
                    >
                        {`v${version.version} · failed`}
                    </Box>
                </Tooltip>
            );
        }
        return (
            <UnstyledButton
                key={version.version}
                className={classes.chip}
                data-state={
                    isCurrent && !viewedVersion
                        ? 'current'
                        : isViewing
                          ? 'viewing'
                          : undefined
                }
                onClick={() => onView(isCurrent ? null : version.version)}
            >
                {isCurrent
                    ? `v${version.version} · current`
                    : `v${version.version}`}
            </UnstyledButton>
        );
    };

    return (
        <Box className={classes.wrap}>
            <Box className={classes.row}>
                {hasEarlier && (
                    <UnstyledButton
                        className={classes.earlier}
                        disabled={isFetchingEarlier}
                        onClick={fetchEarlier}
                    >
                        {isFetchingEarlier ? 'Loading…' : '…'}
                    </UnstyledButton>
                )}
                {ordered.map(chipFor)}
                {showLiveChip && (
                    <Box
                        component="span"
                        className={classes.chip}
                        data-state="building"
                    >
                        {build.claimedVersion === null
                            ? 'building…'
                            : `v${build.claimedVersion} · building…`}
                    </Box>
                )}
            </Box>

            {viewedVersion !== null && viewedVersion !== latestReadyVersion && (
                <Box className={classes.viewingPill}>
                    <Text fz={13} c="ldGray.7" span>
                        Viewing{' '}
                        <Text fw={600} span inherit>
                            {`v${viewedVersion}`}
                        </Text>{' '}
                        · not the current version
                    </Text>
                    <Button
                        size="compact-xs"
                        radius="xl"
                        onClick={() => setRestoreTarget(viewedVersion)}
                    >
                        {`Restore v${viewedVersion}`}
                    </Button>
                    <Button
                        size="compact-xs"
                        radius="xl"
                        variant="subtle"
                        onClick={() => onView(null)}
                    >
                        {latestReadyVersion !== null
                            ? `Back to v${latestReadyVersion}`
                            : 'Back to current'}
                    </Button>
                </Box>
            )}

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

export default VersionChips;
