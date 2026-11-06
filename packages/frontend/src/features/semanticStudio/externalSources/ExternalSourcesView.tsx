/**
 * External sources on the Semantic Layer page, for the people who manage
 * them: the list with each file's or sheet's size and state, and above a
 * source's fields what it holds and its controls.
 */
import { type ExternalSource } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Image,
    Menu,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconChartBar,
    IconDots,
    IconEye,
    IconFileTypeCsv,
    IconPencil,
    IconPlugConnected,
    IconPlus,
    IconRefresh,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
import googleSheetsLogo from '../../../svgs/google-sheets.svg';
import {
    useExternalSources,
    useReconnectExternalSource,
    useRefreshExternalSource,
} from '../../externalSources/hooks/useExternalSources';
import liveClasses from '../liveSources/LiveSources.module.css';
import { useExternalSourceActions } from './externalSourceActions';
import {
    getExternalSourceLabel,
    getExternalSourceRef,
    getExternalSourceState,
    isGoogleSheet,
    toExternalSourceRow,
    toExternalSourceRows,
    type ExternalSourceState,
} from './externalSourceRows';
import classes from './ExternalSources.module.css';

/** The same marks as the tree: the Sheets logo, or a CSV file. */
const SourceIcon: FC<{ source: ExternalSource }> = ({ source }) =>
    isGoogleSheet(source) ? (
        <Image src={googleSheetsLogo} alt="" w={16} h={16} />
    ) : (
        <MantineIcon icon={IconFileTypeCsv} color="dimmed" />
    );

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

const StateBadge: FC<{ state: ExternalSourceState }> = ({ state }) => (
    <Tooltip label={state.message} disabled={!state.message} withinPortal>
        <Badge size="sm" variant="light" color={state.color}>
            {state.label}
        </Badge>
    </Tooltip>
);

const lastRefreshed = (source: ExternalSource) => {
    const at = source.lastRefreshedAt ? dayjs(source.lastRefreshedAt) : null;
    return at
        ? { value: at.fromNow(), title: at.format('YYYY-MM-DD HH:mm') }
        : { value: '—', title: undefined };
};

/** Explore, preview, refresh, reconnect, replace, rename and delete: one source's controls. */
const ExternalSourceMenu: FC<{
    projectUuid: string;
    source: ExternalSource;
    /** The page header shows Refresh as its own button. */
    withRefresh?: boolean;
}> = ({ projectUuid, source, withRefresh = true }) => {
    const actions = useExternalSourceActions();
    const refresh = useRefreshExternalSource(projectUuid);
    const reconnect = useReconnectExternalSource(projectUuid);
    if (!actions) return null;
    const isSheet = isGoogleSheet(source);
    // A source whose first import failed has no table yet: it can only go.
    const hasTable = getExternalSourceRef(source) !== null;
    const [table] = source.tables;
    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Actions for ${getExternalSourceLabel(source)}`}
                    onClick={stopPropagation}
                >
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={stopPropagation}>
                {table ? (
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/tables/${table.name}`}
                        leftSection={<MantineIcon icon={IconChartBar} />}
                    >
                        Open in Explore
                    </Menu.Item>
                ) : null}
                {hasTable ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconEye} />}
                        onClick={() => actions.preview(source)}
                    >
                        Preview data
                    </Menu.Item>
                ) : null}
                {isSheet && withRefresh ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconRefresh} />}
                        disabled={refresh.isLoading}
                        onClick={() => refresh.mutate(source.sourceUuid)}
                    >
                        Refresh
                    </Menu.Item>
                ) : null}
                {isSheet ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPlugConnected} />}
                        disabled={reconnect.isLoading}
                        onClick={() => reconnect.mutate(source.sourceUuid)}
                    >
                        Reconnect
                    </Menu.Item>
                ) : hasTable ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconUpload} />}
                        onClick={() => actions.replaceFile(source)}
                    >
                        Replace file
                    </Menu.Item>
                ) : null}
                {hasTable ? (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => actions.rename(source)}
                    >
                        Rename
                    </Menu.Item>
                ) : null}
                {hasTable || isSheet ? <Menu.Divider /> : null}
                <Menu.Item
                    color="red"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    onClick={() => actions.remove(source)}
                >
                    Delete
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

/** The page header's controls for one source. */
export const ExternalSourceHeaderActions: FC<{
    projectUuid: string;
    source: ExternalSource;
}> = ({ projectUuid, source }) => {
    const refresh = useRefreshExternalSource(projectUuid);
    return (
        <>
            {isGoogleSheet(source) ? (
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<MantineIcon icon={IconRefresh} size={14} />}
                    loading={refresh.isLoading}
                    onClick={() => refresh.mutate(source.sourceUuid)}
                >
                    Refresh
                </Button>
            ) : null}
            <ExternalSourceMenu
                projectUuid={projectUuid}
                source={source}
                withRefresh={false}
            />
        </>
    );
};

const EmptyExternalSources: FC = () => {
    const actions = useExternalSourceActions();
    const { data: health } = useHealth();
    // Uploads need the import engine, as in the Add menu.
    const canAdd =
        actions !== null && health?.externalSources.engineAvailable === true;
    return (
        <Paper variant="dotted" p="xl">
            <Stack gap="sm" align="center">
                <Title order={5}>No external sources</Title>
                <Text fz="sm" c="dimmed" ta="center" maw={420}>
                    Upload a CSV or connect a Google Sheet to query it alongside
                    your warehouse.
                </Text>
                {canAdd ? (
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} size={14} />}
                        onClick={() => actions?.add()}
                    >
                        Add external source
                    </Button>
                ) : null}
            </Stack>
        </Paper>
    );
};

/** Every external source with its size and state; a row opens it. */
export const ExternalSourcesTable: FC<{
    projectUuid: string;
    onOpen: (sourceUuid: string) => void;
}> = ({ projectUuid, onOpen }) => {
    const { data: sources, error } = useExternalSources(projectUuid);
    if (error) {
        return (
            <Text fz="sm" c="dimmed">
                Couldn't load external sources: {error.error.message}
            </Text>
        );
    }
    if (!sources) return null;
    const rows = toExternalSourceRows(sources);
    if (rows.length === 0) return <EmptyExternalSources />;
    const onKeyDown =
        (sourceUuid: string) => (event: KeyboardEvent<HTMLElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(sourceUuid);
            }
        };
    return (
        <Box className={liveClasses.table} role="table">
            <Box className={classes.row} data-head role="row">
                <span role="columnheader">Name</span>
                <span role="columnheader">Type</span>
                <span role="columnheader" className={liveClasses.number}>
                    Rows
                </span>
                <span role="columnheader">Last refreshed</span>
                <span role="columnheader">Status</span>
                <span />
            </Box>
            {rows.map(({ source, label, type, rows: rowCount, state }) => {
                const refreshed = lastRefreshed(source);
                return (
                    <Box
                        key={source.sourceUuid}
                        className={classes.row}
                        role="row"
                        tabIndex={0}
                        onClick={() => onOpen(source.sourceUuid)}
                        onKeyDown={onKeyDown(source.sourceUuid)}
                    >
                        <Group gap={8} wrap="nowrap" miw={0} role="cell">
                            <SourceIcon source={source} />
                            <Text className={liveClasses.name} truncate>
                                {label}
                            </Text>
                        </Group>
                        <Text span role="cell" fz={13} c="dimmed" truncate>
                            {type}
                        </Text>
                        <span role="cell" className={liveClasses.number}>
                            {rowCount}
                        </span>
                        <Text
                            span
                            role="cell"
                            fz={13}
                            c="dimmed"
                            title={refreshed.title}
                        >
                            {refreshed.value}
                        </Text>
                        <Box role="cell">
                            <StateBadge state={state} />
                        </Box>
                        <Box role="cell">
                            <ExternalSourceMenu
                                projectUuid={projectUuid}
                                source={source}
                            />
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

const Stat: FC<{ label: string; value: ReactNode; title?: string }> = ({
    label,
    value,
    title,
}) => (
    <Box className={liveClasses.stat}>
        <span className={liveClasses.statLabel}>{label}</span>
        <span
            className={liveClasses.statValue}
            title={title ?? (typeof value === 'string' ? value : undefined)}
        >
            {value}
        </span>
    </Box>
);

/** What one source holds and whether it is ready, above its fields. */
export const ExternalSourceSummary: FC<{ source: ExternalSource }> = ({
    source,
}) => {
    const row = toExternalSourceRow(source);
    const refreshed = lastRefreshed(source);
    const state = getExternalSourceState(source);
    return (
        <Box className={classes.summary} aria-label="External source">
            <Stat label="Type" value={row.type} />
            <Stat label="Rows" value={row.rows} />
            <Stat
                label="Last refreshed"
                value={refreshed.value}
                title={refreshed.title}
            />
            <Stat label="Status" value={<StateBadge state={state} />} />
        </Box>
    );
};
