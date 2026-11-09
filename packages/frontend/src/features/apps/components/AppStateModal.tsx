import {
    type AppStateAdminSharedKey,
    type AppStateHistoryEntry,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Code,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconDatabase,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
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

const HistoryList: FC<{
    projectUuid: string;
    appUuid: string;
    stateKey: string;
}> = ({ projectUuid, appUuid, stateKey }) => {
    const { data, isInitialLoading, error } = useAppSharedStateHistory(
        projectUuid,
        appUuid,
        stateKey,
    );
    if (isInitialLoading) {
        return (
            <Group justify="center" py="xs">
                <Loader size="xs" />
            </Group>
        );
    }
    if (error || !data) {
        return (
            <Text size="xs" c="red" py="xs">
                {error?.error.message ?? 'Failed to load history'}
            </Text>
        );
    }
    return (
        <Stack gap="xs" py="xs">
            {data.versions.map((entry) => (
                <Box key={entry.version}>
                    <Group gap="xs">
                        <Text size="xs" fw={600}>
                            v{entry.version}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {historyAuthorName(entry)}
                        </Text>
                        <TimeAgo date={entry.createdAt} />
                    </Group>
                    <ScrollArea.Autosize mah={120}>
                        <Code block fz="xs" className={classes.historyValue}>
                            {JSON.stringify(entry.value, null, 2)}
                        </Code>
                    </ScrollArea.Autosize>
                </Box>
            ))}
            {data.versions.length === 0 && (
                <Text size="xs" c="dimmed">
                    No history for this key
                </Text>
            )}
        </Stack>
    );
};

const SharedKeyRow: FC<{
    projectUuid: string;
    appUuid: string;
    entry: AppStateAdminSharedKey;
    expanded: boolean;
    onToggle: () => void;
    onClear: () => void;
    isClearing: boolean;
}> = ({
    projectUuid,
    appUuid,
    entry,
    expanded,
    onToggle,
    onClear,
    isClearing,
}) => (
    <>
        <Table.Tr className={classes.clickableRow} onClick={onToggle}>
            <Table.Td>
                <Group gap={4} wrap="nowrap">
                    <MantineIcon
                        icon={expanded ? IconChevronDown : IconChevronRight}
                        size={12}
                    />
                    <Text size="xs" ff="monospace" truncate="end" maw={260}>
                        {entry.key}
                    </Text>
                </Group>
            </Table.Td>
            <Table.Td>
                <Text size="xs">{formatBytes(entry.valueBytes)}</Text>
            </Table.Td>
            <Table.Td>
                <Text size="xs">v{entry.version}</Text>
            </Table.Td>
            <Table.Td>
                <Text size="xs" span>
                    {entry.updatedBy?.name ?? 'Unknown'}
                </Text>{' '}
                <TimeAgo date={entry.updatedAt} />
            </Table.Td>
            <Table.Td onClick={(e) => e.stopPropagation()}>
                <Tooltip label="Clear this key">
                    <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        loading={isClearing}
                        onClick={onClear}
                        aria-label={`Clear ${entry.key}`}
                    >
                        <MantineIcon icon={IconTrash} size={12} />
                    </ActionIcon>
                </Tooltip>
            </Table.Td>
        </Table.Tr>
        {expanded && (
            <Table.Tr>
                <Table.Td colSpan={5} p={0} px="sm">
                    <HistoryList
                        projectUuid={projectUuid}
                        appUuid={appUuid}
                        stateKey={entry.key}
                    />
                </Table.Td>
            </Table.Tr>
        )}
    </>
);

type Props = {
    projectUuid: string;
    appUuid: string;
    appName: string;
    opened: boolean;
    onClose: () => void;
};

/**
 * The "App state" panel of the app's manage surface: shared keys with size,
 * version and last author, a per-key history view, and a clear-key action.
 * Per-user values are private, so only their volume is shown.
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
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [clearCandidate, setClearCandidate] = useState<string | null>(null);

    const isEmpty =
        data && data.shared.length === 0 && data.user.keyCount === 0;

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={onClose}
                title="App state"
                icon={IconDatabase}
                size="lg"
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
                        This app hasn't saved any state yet.
                    </Text>
                )}
                {data && !isEmpty && (
                    <Stack gap="sm">
                        {data.shared.length > 0 ? (
                            <Table verticalSpacing={4}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Shared key</Table.Th>
                                        <Table.Th>Size</Table.Th>
                                        <Table.Th>Version</Table.Th>
                                        <Table.Th>Last updated</Table.Th>
                                        <Table.Th />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {data.shared.map((entry) => (
                                        <SharedKeyRow
                                            key={entry.key}
                                            projectUuid={projectUuid}
                                            appUuid={appUuid}
                                            entry={entry}
                                            expanded={expandedKey === entry.key}
                                            onToggle={() =>
                                                setExpandedKey((prev) =>
                                                    prev === entry.key
                                                        ? null
                                                        : entry.key,
                                                )
                                            }
                                            onClear={() =>
                                                setClearCandidate(entry.key)
                                            }
                                            isClearing={
                                                isClearing &&
                                                clearCandidate === entry.key
                                            }
                                        />
                                    ))}
                                </Table.Tbody>
                            </Table>
                        ) : (
                            <Text size="sm" c="dimmed">
                                No shared values saved yet.
                            </Text>
                        )}
                        <Text size="xs" c="dimmed">
                            {data.user.keyCount === 0
                                ? 'No per-user values saved yet.'
                                : `${data.user.keyCount} per-user ${
                                      data.user.keyCount === 1
                                          ? 'value'
                                          : 'values'
                                  } across ${data.user.userCount} ${
                                      data.user.userCount === 1
                                          ? 'person'
                                          : 'people'
                                  }. Per-user values are private and never shown here.`}
                        </Text>
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
                                    setExpandedKey((prev) =>
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
