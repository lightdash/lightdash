/**
 * One live data source's settings, for the admins who manage it: its
 * details and sign-in, its fields, how long its results are reused, and
 * deleting it.
 */
import { LIVE_SOURCE_CACHE_TTL_MAX_SECONDS } from '@lightdash/common';
import { Button, Divider, Group, Select, Stack, Text } from '@mantine/core';
import {
    IconPencil,
    IconRefresh,
    IconRefreshDot,
    IconReload,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../../externalConnections/hooks/useLiveSourceCache';
import { useRefreshLiveSourceFields } from '../../externalConnections/hooks/useLiveSourceFields';
import { ProjectCacheOffAlert } from '../../externalConnections/liveSources/ProjectCacheOffAlert';
import {
    formatFreshness,
    getLiveSourceFreshness,
    type LiveSourceConnection,
} from './liveSourceRows';

const WINDOW_SECONDS = [
    0,
    60,
    5 * 60,
    15 * 60,
    30 * 60,
    60 * 60,
    6 * 60 * 60,
    LIVE_SOURCE_CACHE_TTL_MAX_SECONDS,
];

const SettingRow: FC<{
    label: string;
    description: string;
    children: ReactNode;
}> = ({ label, description, children }) => (
    <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap={2} miw={0}>
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Text fz="xs" c="dimmed">
                {description}
            </Text>
        </Stack>
        {children}
    </Group>
);

export const LiveSourceSettingsModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** Null when this instance has no sign-in for the integration. */
    reconnect: (() => void) | null;
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
}> = ({ projectUuid, connection, reconnect, onEdit, onDelete, onClose }) => {
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const updateCache = useUpdateLiveSourceCache(params);
    const purge = usePurgeLiveSourceCache(params);
    const refreshFields = useRefreshLiveSourceFields(params);
    const freshness = getLiveSourceFreshness(connection);
    // A window set through the API may not be one of the presets.
    const seconds = WINDOW_SECONDS.includes(freshness.seconds)
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, freshness.seconds].sort((a, b) => a - b);
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Settings"
            icon={IconSettings}
            size="lg"
            cancelLabel="Close"
        >
            <Stack gap="md">
                <SettingRow
                    label="Details"
                    description={`The name and account "${connection.name}" reads from.`}
                >
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={onEdit}
                    >
                        Edit
                    </Button>
                </SettingRow>
                {reconnect ? (
                    <SettingRow
                        label="Sign-in"
                        description="Sign in to the integration again, as yourself."
                    >
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            onClick={reconnect}
                        >
                            Sign in again
                        </Button>
                    </SettingRow>
                ) : null}
                <SettingRow
                    label="Fields"
                    description="Read the fields the integration offers again."
                >
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconReload} />}
                        loading={refreshFields.isLoading}
                        onClick={() => refreshFields.mutate()}
                    >
                        Refresh fields
                    </Button>
                </SettingRow>
                <Divider />
                <ProjectCacheOffAlert projectUuid={projectUuid} />
                <SettingRow
                    label="Reuse results for"
                    description="How long everyone reuses a result, up to the project's cache duration."
                >
                    <Select
                        size="xs"
                        w={140}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        disabled={updateCache.isLoading}
                        value={String(freshness.seconds)}
                        onChange={(picked) =>
                            picked &&
                            updateCache.mutate({ ttlSeconds: Number(picked) })
                        }
                        data={seconds.map((option) => ({
                            value: String(option),
                            label: formatFreshness(option),
                        }))}
                    />
                </SettingRow>
                <SettingRow
                    label="Cached results"
                    description="The next query from anyone calls the integration for fresh data."
                >
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconRefreshDot} />}
                        loading={purge.isLoading}
                        onClick={() => purge.mutate()}
                    >
                        Purge cache
                    </Button>
                </SettingRow>
                <Divider />
                <SettingRow
                    label="Delete live data source"
                    description="Disconnects it and removes its explores."
                >
                    <Button
                        size="xs"
                        variant="outline"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Button>
                </SettingRow>
            </Stack>
        </MantineModal>
    );
};
