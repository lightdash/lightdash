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
import { useAppVersionHistory } from '../hooks/useAppVersionHistory';
import { getVersionAuthorName } from '../utils/versionsToChatMessages';
import classes from './DataAppVizDock.module.css';
import DataAppVizVersionLog from './DataAppVizVersionLog';

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
        <Text size="xs" c="dimmed" truncate="end">
            {authorName
                ? `${verb} by ${authorName} · ${timeAgo}`
                : `${verb} ${timeAgo}`}
        </Text>
    );
};

type Props = {
    projectUuid: string;
    /**
     * The visualization whose versions are on show, already resolved by the
     * caller. The dock does not work out which one that is.
     */
    dataAppVizUuid: string;
    /** Replaces the provenance line on the resting bar while it is present. */
    status?: ReactNode;
    /** Sits under the log wherever there is one. A resting dock has none, so
     *  it is one line and nothing else. */
    footer?: ReactNode;
};

/**
 * The visualization's versions, docked to the bottom of the config panel.
 *
 * Resting it is a slim bar: where this visualization came from, and the way in.
 * Expanded it is every version it has had, and the way out to the full builder.
 * The settings above it never move.
 *
 * What the bar reports and what sits under the log are the caller's business,
 * so the status line and the footer are slots rather than branches here.
 */
const DataAppVizDock: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    status,
    footer,
}) => {
    const [isExpanded, { toggle }] = useDisclosure(false);
    const { latest, oldest, hasOrigin, latestReadyVersion, isError } =
        useAppVersionHistory(projectUuid, dataAppVizUuid);
    // With the origin loaded the line reports where the visualization came
    // from; without it the verb flips to "Last updated", which is the newest
    // version rather than the oldest page we happen to hold.
    const provenanceVersion = hasOrigin ? oldest : latest;
    // The badge names what the chart is rendering, so it tracks the newest
    // finished version. A build that failed or is still running has not
    // replaced it.
    const versionBadge = latestReadyVersion !== null && (
        <Badge size="xs" variant="light" color="violet">
            {`v${latestReadyVersion}`}
        </Badge>
    );

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
                    />
                </Box>

                {footer && <Box className={classes.footer}>{footer}</Box>}
            </Box>
        );
    }

    return (
        <Box className={classes.dock}>
            <Box className={classes.bar}>
                <button
                    type="button"
                    className={classes.barTrigger}
                    aria-expanded={false}
                    onClick={toggle}
                >
                    <MantineIcon icon={IconPuzzle} size={13} />
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
