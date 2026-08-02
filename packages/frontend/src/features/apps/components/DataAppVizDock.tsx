import { isAppVersionInProgress } from '@lightdash/common';
import { Badge, Box, Button, Group, Text, Tooltip } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconExternalLink,
    IconPuzzle,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppBuildPoller } from '../hooks/useAppBuildPoller';
import { useAppVersionHistory } from '../hooks/useAppVersionHistory';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import { getVersionAuthorName } from '../utils/versionsToChatMessages';
import classes from './DataAppVizDock.module.css';
import DataAppVizVersionLog from './DataAppVizVersionLog';

const ignoreExternalBuildDone = () => undefined;

const Provenance: FC<{
    authorName: string | null;
    at: Date;
    /** False when older versions are still unloaded — then this is not the
     *  origin, it is just the oldest we can see. */
    isOrigin: boolean;
}> = ({ authorName, at, isOrigin }) => {
    const timeAgo = useTimeAgo(at);
    const verb = isOrigin ? 'Built' : 'Last updated';
    return (
        <Text
            size="xs"
            c="dimmed"
            truncate="end"
            className={classes.provenance}
        >
            {authorName
                ? `${verb} by ${authorName} · ${timeAgo}`
                : `${verb} ${timeAgo}`}
        </Text>
    );
};

type Props = {
    projectUuid: string;
    /** The visualization the chart points at; null when it points at none. */
    dataAppVizUuid: string | null;
    build: DataAppVizBuildState;
    /** Ticking `0:12` while a build runs; null when nothing is running. */
    elapsed: string | null;
    /** Replaces the provenance line on the resting bar while it is present. */
    status?: ReactNode;
    /** Sits under the log wherever there is one. A resting dock has none, so
     *  it is one line and nothing else. */
    footer?: ReactNode;
    onCancelBuild?: (() => void) | null;
};

/**
 * The visualization's versions, docked to the bottom of the config panel.
 *
 * Resting it is a slim bar: where this visualization came from, and the way in.
 * Expanded it is every version it has had, the composer to ask for the next
 * one, and the way out to the full builder. The settings above it never move.
 *
 * What the bar reports and what sits under the log are the caller's business,
 * so the status line and the footer are slots rather than branches here.
 *
 * Before anything exists there are no versions to hide, so the dock is the
 * composer alone — collapsing an empty panel is not worth offering.
 */
const DataAppVizDock: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    build,
    elapsed,
    status,
    footer,
    onCancelBuild = null,
}) => {
    // Open on arrival when there is nothing selected: describing one is the
    // only thing to do here.
    const [isExpanded, { toggle }] = useDisclosure(dataAppVizUuid === null);
    const { versions, latest, oldest, hasOrigin, latestReadyVersion, isError } =
        useAppVersionHistory(projectUuid, dataAppVizUuid);
    const isLatestVersionBuilding =
        latest !== null && isAppVersionInProgress(latest.status);
    const isOwnedByPanel = build.isBuilding && build.appUuid === dataAppVizUuid;
    // A build started in the app builder has no local build state to own its
    // worker. Keep the shared app cache moving until that version is terminal.
    useAppBuildPoller(
        projectUuid,
        dataAppVizUuid ?? undefined,
        isLatestVersionBuilding && !isOwnedByPanel,
        ignoreExternalBuildDone,
    );
    // With the origin loaded the line reports where the visualization came
    // from; without it the verb flips to "Last updated", which is the newest
    // version rather than the oldest page we happen to hold.
    const provenanceVersion = hasOrigin ? oldest : latest;
    // The badge names what the chart is rendering, so it tracks the newest
    // finished version. A build that failed or is still running has not
    // replaced it.
    const versionBadge = latestReadyVersion !== null && (
        <Badge
            size="xs"
            variant="light"
            color="violet"
            className={classes.fixedChrome}
        >
            {`v${latestReadyVersion}`}
        </Badge>
    );

    // Version chrome needs versions. A first build in flight has claimed one
    // but landed none, so there is nothing yet to collapse, label or open in
    // the builder — just the build, and the composer under it.
    // Knowing there are none is not the same as failing to find out, so a
    // failed history keeps the bar that can say so.
    const hasLandedVersion =
        versions.some((v) => v.status === 'ready') || isError;

    if (dataAppVizUuid === null || !hasLandedVersion) {
        return (
            <Box className={`${classes.dock} ${classes.dockBare}`}>
                {(dataAppVizUuid !== null || build.error !== null) && (
                    <DataAppVizVersionLog
                        projectUuid={projectUuid}
                        dataAppVizUuid={dataAppVizUuid}
                        build={build}
                        elapsed={elapsed}
                        onCancelBuild={onCancelBuild}
                    />
                )}
                {footer && <Box className={classes.footer}>{footer}</Box>}
            </Box>
        );
    }

    const toggleButton = (
        <Tooltip
            withArrow
            label={isExpanded ? 'Hide versions' : 'Show versions'}
        >
            <button
                type="button"
                className={classes.toggle}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Hide versions' : 'Show versions'}
                onClick={toggle}
            >
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronUp}
                    size={14}
                />
            </button>
        </Tooltip>
    );

    if (isExpanded) {
        return (
            <Box className={`${classes.dock} ${classes.dockExpanded}`}>
                <Group
                    justify="space-between"
                    wrap="nowrap"
                    gap="xs"
                    className={classes.sheetHeader}
                >
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconPuzzle} size={13} />
                        <Text size="xs" fw={600}>
                            Versions
                        </Text>
                        {versionBadge}
                    </Group>

                    <Group gap={4} wrap="nowrap">
                        <Button
                            component="a"
                            href={`/projects/${projectUuid}/apps/${dataAppVizUuid}`}
                            target="_blank"
                            rel="noreferrer"
                            size="compact-xs"
                            variant="default"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={12}
                                />
                            }
                        >
                            Open in builder
                        </Button>
                        {toggleButton}
                    </Group>
                </Group>

                <Box className={classes.log}>
                    <DataAppVizVersionLog
                        projectUuid={projectUuid}
                        dataAppVizUuid={dataAppVizUuid}
                        build={build}
                        elapsed={elapsed}
                        onCancelBuild={onCancelBuild}
                    />
                </Box>

                {footer && <Box className={classes.footer}>{footer}</Box>}
            </Box>
        );
    }

    return (
        <Box className={classes.dock}>
            {build.isBuilding && (
                <Box
                    className={classes.progress}
                    role="progressbar"
                    aria-label="Build in progress"
                    aria-valuetext={elapsed ?? 'Starting'}
                >
                    <Box className={classes.progressBar} />
                </Box>
            )}
            <Box className={classes.bar}>
                <button
                    type="button"
                    className={classes.barTrigger}
                    aria-expanded={false}
                    onClick={toggle}
                >
                    <MantineIcon
                        icon={IconPuzzle}
                        size={13}
                        className={classes.fixedChrome}
                    />
                    {status ?? (
                        <>
                            {versionBadge}
                            {provenanceVersion ? (
                                <Provenance
                                    authorName={getVersionAuthorName(
                                        provenanceVersion,
                                    )}
                                    at={new Date(provenanceVersion.createdAt)}
                                    isOrigin={hasOrigin}
                                />
                            ) : (
                                // Otherwise the bar is a lone icon that says
                                // nothing about why it is empty.
                                isError && (
                                    <Text size="xs" c="dimmed" truncate="end">
                                        Versions unavailable
                                    </Text>
                                )
                            )}
                        </>
                    )}
                </button>
                {toggleButton}
            </Box>
        </Box>
    );
};

export default DataAppVizDock;
