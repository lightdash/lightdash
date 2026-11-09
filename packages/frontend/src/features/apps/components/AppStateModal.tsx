import {
    APP_STATE_MAX_KEYS_PER_SCOPE,
    APP_STATE_MAX_VALUE_BYTES,
    type AppStateAdminSharedKey,
    type AppStateHistoryEntry,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Code,
    Group,
    Loader,
    Progress,
    ScrollArea,
    Stack,
    Table,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import {
    useAppSharedStateHistory,
    useAppStateAdminOverview,
    useDeleteAppSharedState,
} from '../hooks/useAppStateAdmin';
import classes from './AppStateModal.module.css';

const formatBytes = (bytes: number): string =>
    bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

const TimeAgo: FC<{ date: string }> = ({ date }) => {
    const timeAgo = useTimeAgo(new Date(date));
    return (
        <Tooltip label={new Date(date).toLocaleString()}>
            <Text size="xs" c="dimmed" span>
                {timeAgo}
            </Text>
        </Tooltip>
    );
};

const historyAuthorName = (entry: AppStateHistoryEntry): string => {
    if (entry.author.kind === 'agent') return 'Agent';
    return entry.author.name ?? 'Unknown';
};

/**
 * A value rendered for reading, not as raw JSON: flat objects become a
 * key/value table (nested parts stay JSON inside their cell), everything
 * else falls back to pretty-printed JSON.
 */
const ValueView: FC<{ value: unknown }> = ({ value }) => {
    if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0
    ) {
        return (
            <Table
                withTableBorder
                withColumnBorders
                verticalSpacing="xs"
                horizontalSpacing="sm"
                className={classes.valueTable}
            >
                <Table.Tbody>
                    {Object.entries(value).map(([k, v]) => (
                        <Table.Tr key={k}>
                            <Table.Td>
                                <Code>{k}</Code>
                            </Table.Td>
                            <Table.Td>
                                {typeof v === 'string' ? (
                                    <Text size="xs">{v}</Text>
                                ) : typeof v === 'object' && v !== null ? (
                                    <Code
                                        block
                                        fz="xs"
                                        className={classes.valueJson}
                                    >
                                        {JSON.stringify(v, null, 2)}
                                    </Code>
                                ) : (
                                    <Code>{JSON.stringify(v)}</Code>
                                )}
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        );
    }
    return (
        <Code block fz="xs" className={classes.valueJson}>
            {JSON.stringify(value, null, 2)}
        </Code>
    );
};

const KeyDetail: FC<{
    projectUuid: string;
    appUuid: string;
    entry: AppStateAdminSharedKey;
    onClear: () => void;
}> = ({ projectUuid, appUuid, entry, onClear }) => {
    const { data, isInitialLoading, error } = useAppSharedStateHistory(
        projectUuid,
        appUuid,
        entry.key,
    );
    const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

    // Newest version once history arrives; reset when the key changes
    useEffect(() => {
        setSelectedVersion(data?.versions[0]?.version ?? null);
    }, [entry.key, data]);

    const selected =
        data?.versions.find((v) => v.version === selectedVersion) ??
        data?.versions[0];

    return (
        <Stack gap={0} className={classes.detail}>
            <Group justify="space-between" p="xs" wrap="nowrap">
                <Stack gap={2} miw={0}>
                    <Text size="sm" ff="monospace" fw={600} truncate="end">
                        {entry.key}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {formatBytes(entry.valueBytes)} of{' '}
                        {formatBytes(APP_STATE_MAX_VALUE_BYTES)} max · last
                        updated by {entry.updatedBy?.name ?? 'Unknown'}{' '}
                        <TimeAgo date={entry.updatedAt} />
                    </Text>
                </Stack>
                <Button
                    size="compact-xs"
                    color="red"
                    variant="subtle"
                    className={classes.clearButton}
                    leftSection={<MantineIcon icon={IconTrash} size={12} />}
                    onClick={onClear}
                >
                    Clear
                </Button>
            </Group>
            <div className={classes.detailBody}>
                <ScrollArea className={classes.versionList}>
                    {data?.versions.map((version) => (
                        <UnstyledButton
                            key={version.version}
                            className={
                                version.version === selected?.version
                                    ? `${classes.versionItem} ${classes.versionItemSelected}`
                                    : classes.versionItem
                            }
                            onClick={() => setSelectedVersion(version.version)}
                        >
                            <Group gap={4}>
                                <Text size="xs" fw={600}>
                                    v{version.version}
                                </Text>
                                {version.version === entry.version && (
                                    <Text size="xs" c="violet">
                                        current
                                    </Text>
                                )}
                            </Group>
                            <Text size="xs" c="dimmed" truncate="end">
                                {historyAuthorName(version)}
                            </Text>
                            <TimeAgo date={version.createdAt} />
                        </UnstyledButton>
                    ))}
                </ScrollArea>
                <ScrollArea className={classes.valuePane} p="xs">
                    {isInitialLoading && (
                        <Group justify="center" py="md">
                            <Loader size="xs" />
                        </Group>
                    )}
                    {error && (
                        <Text size="xs" c="red">
                            {error.error.message ?? 'Failed to load history'}
                        </Text>
                    )}
                    {selected && <ValueView value={selected.value} />}
                </ScrollArea>
            </div>
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    appUuid: string;
    appName: string;
    opened: boolean;
    onClose: () => void;
};

/**
 * The "App state" panel of the app's manage surface: a browser over the
 * values the app has saved. Shared values (one per key, visible to every
 * viewer) are listed with their version history; per-user values are private
 * to each person, so only their volume is shown.
 */
export const AppStateModal: FC<Props> = ({
    projectUuid,
    appUuid,
    appName,
    opened,
    onClose,
}) => {
    const { data, isInitialLoading, error } = useAppStateAdminOverview(
        projectUuid,
        appUuid,
        { enabled: opened },
    );
    const { mutate: clearKey, isLoading: isClearing } = useDeleteAppSharedState(
        projectUuid,
        appUuid,
    );
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [clearCandidate, setClearCandidate] = useState<string | null>(null);

    const isEmpty =
        data && data.shared.length === 0 && data.user.keyCount === 0;

    const selectedEntry =
        data?.shared.find((entry) => entry.key === selectedKey) ??
        data?.shared[0];
    const totalSharedBytes =
        data?.shared.reduce((sum, entry) => sum + entry.valueBytes, 0) ?? 0;

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={onClose}
                title="App state"
                subtitle={
                    <>
                        Values this app has saved. Shared values are visible to
                        every viewer; per-user values are private to each
                        person.{' '}
                        <Anchor
                            href="https://docs.lightdash.com/data-apps/saved-app-state"
                            target="_blank"
                            fz="inherit"
                        >
                            Learn more
                        </Anchor>
                    </>
                }
                icon={IconDatabase}
                size={960}
                cancelLabel={false}
            >
                {isInitialLoading && (
                    <Group justify="center" py="md">
                        <Loader size="sm" />
                    </Group>
                )}
                {error && (
                    <Text size="sm" c="red">
                        {error.error.message}
                    </Text>
                )}
                {isEmpty && (
                    <Text size="sm" c="dimmed">
                        This app hasn't saved any state yet. When it does,
                        shared values and their history show up here.
                    </Text>
                )}
                {data && !isEmpty && (
                    <Stack gap="sm">
                        {data.shared.length > 0 ? (
                            <div className={classes.browser}>
                                <ScrollArea className={classes.keyList}>
                                    {data.shared.map((entry) => {
                                        const isSelected =
                                            entry.key === selectedEntry?.key;
                                        return (
                                            <UnstyledButton
                                                key={entry.key}
                                                className={
                                                    isSelected
                                                        ? `${classes.keyItem} ${classes.keyItemSelected}`
                                                        : classes.keyItem
                                                }
                                                onClick={() =>
                                                    setSelectedKey(entry.key)
                                                }
                                            >
                                                <Text
                                                    size="xs"
                                                    ff="monospace"
                                                    fw={
                                                        isSelected
                                                            ? 600
                                                            : undefined
                                                    }
                                                    truncate="end"
                                                >
                                                    {entry.key}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {formatBytes(
                                                        entry.valueBytes,
                                                    )}{' '}
                                                    · v{entry.version} ·{' '}
                                                    <TimeAgo
                                                        date={entry.updatedAt}
                                                    />
                                                </Text>
                                            </UnstyledButton>
                                        );
                                    })}
                                </ScrollArea>
                                {selectedEntry && (
                                    <KeyDetail
                                        key={selectedEntry.key}
                                        projectUuid={projectUuid}
                                        appUuid={appUuid}
                                        entry={selectedEntry}
                                        onClear={() =>
                                            setClearCandidate(selectedEntry.key)
                                        }
                                    />
                                )}
                            </div>
                        ) : (
                            <Text size="sm" c="dimmed">
                                No shared values saved yet.
                            </Text>
                        )}
                        <Group gap="xl" align="flex-start">
                            <Stack gap={2} flex={1}>
                                <Group justify="space-between">
                                    <Text size="xs" fw={500}>
                                        Shared storage
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {data.shared.length} of{' '}
                                        {APP_STATE_MAX_KEYS_PER_SCOPE} keys ·{' '}
                                        {formatBytes(totalSharedBytes)}
                                    </Text>
                                </Group>
                                <Progress
                                    size="xs"
                                    color="violet"
                                    value={
                                        (data.shared.length /
                                            APP_STATE_MAX_KEYS_PER_SCOPE) *
                                        100
                                    }
                                />
                                <Text size="xs" c="dimmed">
                                    Each value can hold up to{' '}
                                    {formatBytes(APP_STATE_MAX_VALUE_BYTES)}.
                                </Text>
                            </Stack>
                            <Stack gap={2} flex={1}>
                                <Text size="xs" fw={500}>
                                    Per-user storage
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {data.user.keyCount === 0
                                        ? 'No per-user values saved yet.'
                                        : `${data.user.keyCount} ${
                                              data.user.keyCount === 1
                                                  ? 'value'
                                                  : 'values'
                                          } across ${data.user.userCount} ${
                                              data.user.userCount === 1
                                                  ? 'person'
                                                  : 'people'
                                          }, up to ${APP_STATE_MAX_KEYS_PER_SCOPE} keys each.`}{' '}
                                    Per-user values are private and never shown
                                    here.
                                </Text>
                            </Stack>
                        </Group>
                    </Stack>
                )}
            </MantineModal>
            {clearCandidate !== null && (
                <MantineModal
                    opened
                    onClose={() => setClearCandidate(null)}
                    title="Clear shared key"
                    icon={IconTrash}
                    variant="delete"
                    size="sm"
                    confirmLabel="Clear"
                    confirmLoading={isClearing}
                    onConfirm={() =>
                        clearKey(
                            { key: clearCandidate },
                            {
                                onSuccess: () => {
                                    setClearCandidate(null);
                                    setSelectedKey((prev) =>
                                        prev === clearCandidate ? null : prev,
                                    );
                                },
                            },
                        )
                    }
                >
                    <Text size="sm">
                        Clear{' '}
                        <Text span ff="monospace" fw={600}>
                            {clearCandidate}
                        </Text>{' '}
                        from {appName}? Every viewer loses this value. Its
                        history is kept, so versions keep counting if the app
                        recreates it.
                    </Text>
                </MantineModal>
            )}
        </>
    );
};
