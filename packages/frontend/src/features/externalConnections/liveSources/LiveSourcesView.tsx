/**
 * Live data sources on the Semantic Layer page, for the admins who manage
 * them: the list with each source's usage, and above a source's fields what
 * it reads, how it is used and its controls.
 */
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconPlus, IconSettings } from '@tabler/icons-react';
import {
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';
import { useExternalConnectionApiUsage } from '../hooks/useExternalConnectionApiUsage';
import { useExternalConnectionRateLimitUsage } from '../hooks/useExternalConnectionRateLimitUsage';
import { useExternalConnections } from '../hooks/useExternalConnections';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';
import { useLiveSourceActions } from './liveSourceActions';
import { formatChartCount } from './liveSourceCatalog';
import { LiveSourceIcon } from './LiveSourceIcon';
import {
    formatFreshness,
    getLiveSourceFreshness,
    toLiveSourceRow,
    toLiveSourceRows,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';
import { getRateLimitStat } from './rateLimitFormat';

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

/** Opens one source's settings, in the table: an icon. */
const LiveSourceSettingsIcon: FC<{
    connection: LiveSourceConnection;
    onOpenSettings: (connectionUuid: string) => void;
}> = ({ connection, onOpenSettings }) => (
    <Tooltip label="Settings" withinPortal>
        <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Settings for ${connection.name}`}
            onClick={(event) => {
                stopPropagation(event);
                onOpenSettings(connection.externalConnectionUuid);
            }}
        >
            <MantineIcon icon={IconSettings} />
        </ActionIcon>
    </Tooltip>
);

const EmptyLiveSources: FC = () => {
    const actions = useLiveSourceActions();
    return (
        <Paper variant="dotted" p="xl">
            <Stack gap="sm" align="center">
                <Title order={5}>No live data sources</Title>
                <Text fz="sm" c="dimmed" ta="center" maw={420}>
                    Connect PostHog, Google Analytics or Search Console so
                    charts and AI agents can query them alongside your
                    warehouse.
                </Text>
                {actions ? (
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} size={14} />}
                        onClick={actions.add}
                    >
                        Add live data source
                    </Button>
                ) : null}
            </Stack>
        </Paper>
    );
};

/**
 * Says how far back usage goes: the query history retention window, which
 * each usage row carries. With no usage yet, it names the window instead.
 */
const UsageWindowInfo: FC<{ windowDays: number | undefined }> = ({
    windowDays,
}) => {
    const label =
        windowDays === undefined
            ? 'Usage over the query history retention window'
            : `Usage over the last ${windowDays} days`;
    return (
        <Tooltip label={label} withinPortal>
            <MantineIcon
                icon={IconInfoCircle}
                size={12}
                color="dimmed"
                className={classes.usageInfo}
                aria-label={label}
            />
        </Tooltip>
    );
};

/** Every live data source, with how much it was used; a row opens it. */
export const LiveSourcesTable: FC<{
    projectUuid: string;
    onOpen: (connectionUuid: string) => void;
    onOpenSettings: (connectionUuid: string) => void;
}> = ({ projectUuid, onOpen, onOpenSettings }) => {
    const canManage = useLiveSourceActions() !== null;
    const { data: connections } = useExternalConnections(projectUuid);
    const { data: usage } = useExternalConnectionApiUsage(projectUuid);
    const rows = toLiveSourceRows(connections ?? [], usage);
    if (rows.length === 0) return <EmptyLiveSources />;
    const open = (connectionUuid: string) => () => onOpen(connectionUuid);
    const onKeyDown =
        (connectionUuid: string) => (event: KeyboardEvent<HTMLElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(connectionUuid);
            }
        };
    return (
        <Box className={classes.table} role="table">
            <Box className={classes.row} data-head role="row">
                <span role="columnheader">Integration</span>
                <span role="columnheader">Name</span>
                <span
                    role="columnheader"
                    className={`${classes.number} ${classes.headWithInfo}`}
                >
                    Data read
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                </span>
                <span
                    role="columnheader"
                    className={`${classes.number} ${classes.headWithInfo}`}
                >
                    API calls
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                </span>
                <span />
            </Box>
            {rows.map(({ connection, integration, target, usage: used }) => (
                <Box
                    key={connection.externalConnectionUuid}
                    className={classes.row}
                    role="row"
                    tabIndex={0}
                    onClick={open(connection.externalConnectionUuid)}
                    onKeyDown={onKeyDown(connection.externalConnectionUuid)}
                >
                    <Group gap={8} wrap="nowrap" miw={0} role="cell">
                        <LiveSourceIcon
                            connector={connection.apiSource.connector}
                        />
                        <Text fz={13} truncate>
                            {integration}
                        </Text>
                    </Group>
                    <Text
                        role="cell"
                        className={classes.name}
                        miw={0}
                        truncate
                        title={target}
                    >
                        {connection.name}
                    </Text>
                    <span role="cell" className={classes.number}>
                        {used.dataRead}
                    </span>
                    <span
                        role="cell"
                        className={classes.number}
                        title={
                            used.medianLatency
                                ? `${used.apiCalls} calls, median latency ${used.medianLatency}`
                                : undefined
                        }
                    >
                        {used.apiCalls}
                        {used.medianLatency ? (
                            <span className={classes.statDetail}>
                                {' '}
                                ({used.medianLatency})
                            </span>
                        ) : null}
                    </span>
                    <Box role="cell">
                        {canManage ? (
                            <LiveSourceSettingsIcon
                                connection={connection}
                                onOpenSettings={onOpenSettings}
                            />
                        ) : null}
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

/** A label over a value, with an optional dimmed detail after it, such as (902ms). */
const Stat: FC<{
    label: string;
    value: string;
    detail?: string | null;
    title?: string;
    /** Shown after the label, such as an info icon. */
    labelExtra?: ReactNode;
    /** Colours the value: red for a full rate limit, orange for a warning. */
    tone?: 'danger' | 'warning';
}> = ({ label, value, detail, title, labelExtra, tone }) => (
    <Box className={classes.stat}>
        <span className={classes.statLabel}>
            {label}
            {labelExtra}
        </span>
        <span
            className={classes.statValue}
            data-tone={tone}
            title={title ?? (detail ? `${value} (${detail})` : value)}
        >
            {value}
            {detail && <span className={classes.statDetail}> ({detail})</span>}
        </span>
    </Box>
);

/** What one source reads and how it is used, above its fields. */
export const LiveSourceSummary: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** The labels of the source's explores, when it has several. */
    exploreLabels?: string[];
}> = ({ projectUuid, connection, exploreLabels = [] }) => {
    const { data: usage } = useExternalConnectionApiUsage(projectUuid);
    const { data: fields } = useLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const { data: projectCache } = useResultsCacheStatus(projectUuid);
    const { data: rateLimits } = useExternalConnectionRateLimitUsage({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const rateLimit = getRateLimitStat(rateLimits);
    const isProjectCacheOff = projectCache?.enabled === false;
    const row = toLiveSourceRow(connection, usage);
    const freshness = getLiveSourceFreshness(connection);
    const cachingTitle =
        freshness === 0
            ? 'Every query calls the integration'
            : `A result answers the same query for everyone for ${formatFreshness(freshness)}`;
    // Every explore whose fields can be curated, not only the first
    const allFields = fields?.explores.flatMap((explore) => explore.fields);
    const inUse = allFields?.filter((field) => field.inUse).length;
    return (
        <Box className={classes.summary} aria-label="Live data source">
            <Stat label="Integration" value={row.integration} />
            {exploreLabels.length > 1 ? (
                <Stat label="Explores" value={exploreLabels.join(', ')} />
            ) : (
                <Stat label="Explore" value={fields?.exploreName ?? '—'} />
            )}
            <Stat
                label="Fields in use"
                value={
                    allFields && inUse !== undefined
                        ? `${inUse.toLocaleString()} of ${allFields.length.toLocaleString()}`
                        : '—'
                }
            />
            <Stat
                label="Used by"
                value={fields ? formatChartCount(fields.usedByChartCount) : '—'}
            />
            <Stat
                label="Data read"
                value={row.usage.dataRead}
                labelExtra={
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                }
            />
            <Stat
                label="API calls"
                value={row.usage.apiCalls}
                labelExtra={
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                }
                detail={row.usage.medianLatency}
                title={
                    row.usage.medianLatency
                        ? `${row.usage.apiCalls} calls, median latency ${row.usage.medianLatency}`
                        : undefined
                }
            />
            <Stat
                label="Cache"
                value={
                    isProjectCacheOff ? 'Disabled' : formatFreshness(freshness)
                }
                detail={isProjectCacheOff ? null : row.usage.cacheHitsLabel}
                title={
                    isProjectCacheOff
                        ? 'Results caching is off for this project'
                        : cachingTitle
                }
                tone={isProjectCacheOff ? 'warning' : undefined}
            />
            <Stat
                label="Rate limit"
                value={rateLimit.value}
                detail={rateLimit.detail}
                title={rateLimit.title}
                tone={rateLimit.limitReached ? 'danger' : undefined}
            />
        </Box>
    );
};
