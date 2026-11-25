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
import {
    IconInfoCircle,
    IconLock,
    IconPlus,
    IconSettings,
} from '@tabler/icons-react';
import {
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import tableClasses from '../../../components/common/sourceTable.module.css';
import { useExternalConnectionApiUsage } from '../hooks/useExternalConnectionApiUsage';
import { useExternalConnections } from '../hooks/useExternalConnections';
import { useLiveSourceFields } from '../hooks/useLiveSourceFields';
import { useLiveSourceActions } from './liveSourceActions';
/**
 * Live data sources on the Semantic Layer page, for the admins who manage
 * them: the list with each source's usage, and above a source's fields what
 * it reads, how it is used and its controls.
 */
import { LiveSourceIcon } from './LiveSourceIcon';
import {
    describeLiveSourceAccessRule,
    toLiveSourceRow,
    toLiveSourceRows,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

/** Opens one source's settings, in the table: an icon. */
/** A lock beside a source that only some people can query, with its rule as a tooltip. */
const AccessRuleBadge: FC<{ connection: LiveSourceConnection }> = ({
    connection,
}) => {
    const rule = describeLiveSourceAccessRule(connection.accessRule);
    if (!rule) return null;
    const label = `Only people whose ${rule} can query it`;
    return (
        <Tooltip label={label} withinPortal multiline maw={320}>
            <MantineIcon
                icon={IconLock}
                size={14}
                color="dimmed"
                aria-label={label}
            />
        </Tooltip>
    );
};

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
    const isUsed = ({ externalConnectionUuid }: LiveSourceConnection) =>
        (usage?.find(
            (source) =>
                source.externalConnectionUuid === externalConnectionUuid,
        )?.apiCalls ?? 0) > 0;
    const onKeyDown =
        (connectionUuid: string) => (event: KeyboardEvent<HTMLElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(connectionUuid);
            }
        };
    return (
        <Box className={tableClasses.table} role="table">
            <Box className={classes.row} data-head role="row">
                <span role="columnheader">Integration</span>
                <span role="columnheader">Name</span>
                <span
                    role="columnheader"
                    className={`${tableClasses.number} ${classes.headWithInfo}`}
                >
                    Data read
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                </span>
                <span
                    role="columnheader"
                    className={`${tableClasses.number} ${classes.headWithInfo}`}
                >
                    API calls
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                </span>
                <span role="columnheader" className={tableClasses.number}>
                    Median latency
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
                    <Group role="cell" gap={6} wrap="nowrap" miw={0}>
                        <Text
                            className={tableClasses.name}
                            miw={0}
                            truncate
                            title={target}
                        >
                            {connection.name}
                        </Text>
                        <AccessRuleBadge connection={connection} />
                    </Group>
                    {/* A dash until it has been called, as its own page shows */}
                    <span
                        role="cell"
                        className={tableClasses.number}
                        data-empty={!isUsed(connection) || undefined}
                    >
                        {isUsed(connection) ? used.dataRead : '—'}
                    </span>
                    <span
                        role="cell"
                        className={tableClasses.number}
                        data-empty={!isUsed(connection) || undefined}
                    >
                        {isUsed(connection) ? used.apiCalls : '—'}
                    </span>
                    <span
                        role="cell"
                        className={tableClasses.number}
                        data-empty={!used.medianLatency || undefined}
                    >
                        {used.medianLatency ?? '—'}
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
    <Box className={tableClasses.stat}>
        <span className={tableClasses.statLabel}>
            {label}
            {labelExtra}
        </span>
        <span
            className={tableClasses.statValue}
            data-tone={tone}
            title={title ?? (detail ? `${value} (${detail})` : value)}
        >
            {value}
            {detail && (
                <span className={tableClasses.statDetail}> ({detail})</span>
            )}
        </span>
    </Box>
);

/** What one source reads and how it is used, above its fields. */
export const LiveSourceSummary: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const { data: usage } = useExternalConnectionApiUsage(projectUuid);
    const { data: fields } = useLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const row = toLiveSourceRow(connection, usage);
    const explores = fields?.explores;
    const exploresInUse = explores?.filter((explore) => explore.inUse).length;
    return (
        <Box className={tableClasses.summary} aria-label="Live data source">
            <Stat label="Integration" value={row.integration} />
            <Stat
                label="Queries"
                value={
                    usage
                        ? (
                              usage.find(
                                  ({ externalConnectionUuid }) =>
                                      externalConnectionUuid ===
                                      connection.externalConnectionUuid,
                              )?.queries ?? 0
                          ).toLocaleString()
                        : '—'
                }
                labelExtra={
                    <UsageWindowInfo windowDays={usage?.[0]?.windowDays} />
                }
            />
            <Stat
                label="Explores"
                value={exploresInUse?.toLocaleString() ?? '—'}
                title={
                    explores && exploresInUse !== undefined
                        ? `${exploresInUse.toLocaleString()} of ${explores.length.toLocaleString()} in use`
                        : undefined
                }
            />
            <Stat
                label="Access"
                value={
                    describeLiveSourceAccessRule(connection.accessRule)
                        ? 'Restricted'
                        : 'Everyone'
                }
                title={
                    describeLiveSourceAccessRule(connection.accessRule) ??
                    'Everyone in the project can query it'
                }
            />
        </Box>
    );
};
