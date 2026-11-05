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
    Menu,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconDots,
    IconPencil,
    IconPlus,
    IconRefresh,
    IconReload,
    IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC, type KeyboardEvent, type MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExternalConnectionApiUsage } from '../../externalConnections/hooks/useExternalConnectionApiUsage';
import { useExternalConnections } from '../../externalConnections/hooks/useExternalConnections';
import {
    useLiveSourceFields,
    useRefreshLiveSourceFields,
} from '../../externalConnections/hooks/useLiveSourceFields';
import { LiveSourceIcon } from '../../externalConnections/liveSources/LiveSourceIcon';
import { useLiveSourceActions } from './liveSourceActions';
import {
    toLiveSourceRow,
    toLiveSourceRows,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

/** Refresh fields, edit, sign in again and delete: one source's controls. */
const LiveSourceMenu: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** The page header shows Refresh fields as its own button. */
    withRefresh?: boolean;
}> = ({ projectUuid, connection, withRefresh = true }) => {
    const actions = useLiveSourceActions();
    const refreshFields = useRefreshLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    if (!actions) return null;
    const reconnect = actions.getReconnect(connection);
    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Actions for ${connection.name}`}
                    onClick={stopPropagation}
                >
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={stopPropagation}>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => actions.edit(connection)}
                >
                    Edit
                </Menu.Item>
                {withRefresh ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconReload} />}
                        disabled={refreshFields.isLoading}
                        onClick={() => refreshFields.mutate()}
                    >
                        Refresh fields
                    </Menu.Item>
                ) : null}
                {reconnect ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        onClick={reconnect}
                    >
                        Sign in again
                    </Menu.Item>
                ) : null}
                <Menu.Divider />
                <Menu.Item
                    color="red"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    onClick={() => actions.remove(connection)}
                >
                    Delete
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

/** The page header's controls for one source. */
export const LiveSourceHeaderActions: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const refreshFields = useRefreshLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    return (
        <>
            <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<MantineIcon icon={IconReload} size={14} />}
                loading={refreshFields.isLoading}
                onClick={() => refreshFields.mutate()}
            >
                Refresh fields
            </Button>
            <LiveSourceMenu
                projectUuid={projectUuid}
                connection={connection}
                withRefresh={false}
            />
        </>
    );
};

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

/** Every live data source, with how much it was used; a row opens it. */
export const LiveSourcesTable: FC<{
    projectUuid: string;
    onOpen: (connectionUuid: string) => void;
}> = ({ projectUuid, onOpen }) => {
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
                <span role="columnheader" className={classes.number}>
                    Data read
                </span>
                <span role="columnheader" className={classes.number}>
                    API calls
                </span>
                <span role="columnheader" className={classes.number}>
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
                    <span role="cell" className={classes.number}>
                        {used.apiCalls}
                    </span>
                    <Text
                        span
                        role="cell"
                        fz={13}
                        className={classes.number}
                        c={used.medianLatency ? undefined : 'dimmed'}
                    >
                        {used.medianLatency ?? '—'}
                    </Text>
                    <Box role="cell">
                        <LiveSourceMenu
                            projectUuid={projectUuid}
                            connection={connection}
                        />
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

const Stat: FC<{ label: string; value: string; title?: string }> = ({
    label,
    value,
    title,
}) => (
    <Box className={classes.stat}>
        <span className={classes.statLabel}>{label}</span>
        <span className={classes.statValue} title={title ?? value}>
            {value}
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
    const inUse = fields?.fields.filter((field) => field.inUse).length;
    const scannedAt = fields?.scannedAt ? dayjs(fields.scannedAt) : null;
    return (
        <Box className={classes.summary} aria-label="Live data source">
            <Stat label="Integration" value={row.integration} />
            <Stat label="Reads" value={row.target} />
            <Stat
                label="Access"
                value={
                    connection.type === 'oauth_authorization_code'
                        ? 'Signed in'
                        : 'API key'
                }
            />
            <Stat
                label="Fields refreshed"
                value={scannedAt ? scannedAt.fromNow() : 'Never'}
                title={
                    scannedAt ? scannedAt.format('YYYY-MM-DD HH:mm') : undefined
                }
            />
            <Stat label="Data read" value={row.usage.dataRead} />
            <Stat label="API calls" value={row.usage.apiCalls} />
            <Stat
                label="Median latency"
                value={row.usage.medianLatency ?? '—'}
            />
            <Stat
                label="Fields in use"
                value={
                    fields && inUse !== undefined
                        ? `${inUse.toLocaleString()} of ${fields.fields.length.toLocaleString()}`
                        : '—'
                }
            />
        </Box>
    );
};
