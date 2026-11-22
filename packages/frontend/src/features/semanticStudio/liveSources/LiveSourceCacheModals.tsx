/**
 * A live data source's caching, for the admins who manage it: how long its
 * results answer the same query for everyone, and purging them.
 */
import { LIVE_SOURCE_CACHE_TTL_MAX_SECONDS } from '@lightdash/common';
import { Button, Select, Stack, Text } from '@mantine/core';
import { IconClockHour4, IconRefreshDot } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
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

export const LiveSourceCachingModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const freshness = getLiveSourceFreshness(connection);
    const [value, setValue] = useState(String(freshness.seconds));
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const { mutate, isLoading } = useUpdateLiveSourceCache(params);
    const purge = usePurgeLiveSourceCache(params);
    // A window set through the API may not be one of the presets.
    const seconds = WINDOW_SECONDS.includes(freshness.seconds)
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, freshness.seconds].sort((a, b) => a - b);
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Caching"
            icon={IconClockHour4}
            size="md"
            confirmLabel="Save"
            confirmLoading={isLoading}
            cancelDisabled={isLoading}
            leftActions={
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconRefreshDot} />}
                    loading={purge.isLoading}
                    title={`The next query on "${connection.name}" from anyone calls the integration for fresh data`}
                    onClick={() => purge.mutate()}
                >
                    Purge cache
                </Button>
            }
            onConfirm={() =>
                mutate({ ttlSeconds: Number(value) }, { onSuccess: onClose })
            }
        >
            <Stack gap="sm">
                <ProjectCacheOffAlert projectUuid={projectUuid} />
                <Text fz="sm" c="dimmed">
                    How long everyone reuses a result from "{connection.name}",
                    up to the project's cache duration.
                </Text>
                <Select
                    label="Reuse results for"
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                    value={value}
                    onChange={(picked) => picked && setValue(picked)}
                    data={seconds.map((option) => ({
                        value: String(option),
                        label: formatFreshness(option),
                    }))}
                />
            </Stack>
        </MantineModal>
    );
};
