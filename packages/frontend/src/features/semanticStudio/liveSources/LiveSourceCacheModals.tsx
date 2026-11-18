/**
 * A live data source's cache, for the admins who manage it: how long its
 * results answer the same query for everyone, and purging them.
 */
import { LIVE_SOURCE_CACHE_TTL_MAX_SECONDS } from '@lightdash/common';
import { Select, Stack, Text } from '@mantine/core';
import { IconClockHour4, IconRefreshDot } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../../externalConnections/hooks/useLiveSourceCache';
import { ProjectCacheOffAlert } from '../../externalConnections/liveSources/ProjectCacheOffAlert';
import {
    formatFreshness,
    getLiveSourceFreshness,
    type LiveSourceConnection,
} from './liveSourceRows';

const DEFAULT_OPTION = 'default';
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

export const LiveSourceCacheSettingsModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const freshness = getLiveSourceFreshness(connection);
    const [value, setValue] = useState(
        freshness.isDefault ? DEFAULT_OPTION : String(freshness.seconds),
    );
    const { mutate, isLoading } = useUpdateLiveSourceCache({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    // A window set through the API may not be one of the presets.
    const seconds = WINDOW_SECONDS.includes(freshness.seconds)
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, freshness.seconds].sort((a, b) => a - b);
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Cache settings"
            icon={IconClockHour4}
            size="md"
            confirmLabel="Save"
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
            onConfirm={() =>
                mutate(
                    {
                        ttlSeconds:
                            value === DEFAULT_OPTION ? null : Number(value),
                    },
                    { onSuccess: onClose },
                )
            }
        >
            <Stack gap="sm">
                <ProjectCacheOffAlert projectUuid={projectUuid} />
                <Text fz="sm" c="dimmed">
                    A result from "{connection.name}" answers the same query for
                    everyone until it is this old. Longer windows make fewer
                    calls to the integration; shorter ones show newer data.
                </Text>
                <Select
                    label="Reuse results for"
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                    value={value}
                    onChange={(picked) => picked && setValue(picked)}
                    data={[
                        {
                            value: DEFAULT_OPTION,
                            label: `Integration default (${formatFreshness(
                                freshness.defaultSeconds,
                            )})`,
                        },
                        ...seconds.map((option) => ({
                            value: String(option),
                            label: formatFreshness(option),
                        })),
                    ]}
                />
                <Text fz="xs" c="dimmed">
                    Never longer than the project's cache duration.
                </Text>
            </Stack>
        </MantineModal>
    );
};

export const PurgeLiveSourceCacheModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const { mutate, isLoading } = usePurgeLiveSourceCache({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Purge cache"
            icon={IconRefreshDot}
            size="md"
            description={`The next query on "${connection.name}" from anyone will call the integration for fresh data.`}
            confirmLabel="Purge cache"
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
            onConfirm={() => mutate(undefined, { onSuccess: onClose })}
        />
    );
};
