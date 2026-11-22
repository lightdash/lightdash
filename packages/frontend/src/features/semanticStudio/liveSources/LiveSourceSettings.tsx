/**
 * One live data source's settings, below its summary on its own page: its
 * details and sign-in, its fields, how long its results are reused, and
 * deleting it. One card per concern, as on the project's settings pages.
 */
import { LIVE_SOURCE_CACHE_TTL_MAX_SECONDS } from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconRefresh,
    IconRefreshDot,
    IconReload,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
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

const SettingsSection: FC<{
    title: string;
    description?: string;
    /** On the title's line, on the right. */
    action?: ReactNode;
    children?: ReactNode;
}> = ({ title, description, action, children }) => (
    <Paper p="md">
        <Stack gap="md">
            <Group justify="space-between" wrap="nowrap" gap="md">
                <Box miw={0}>
                    <Text fw={500}>{title}</Text>
                    {description ? (
                        <Text fz="sm" c="dimmed">
                            {description}
                        </Text>
                    ) : null}
                </Box>
                {action}
            </Group>
            {children}
        </Stack>
    </Paper>
);

const formatPurgedAt = (purgedAt: Date | null | undefined) =>
    purgedAt
        ? `Last purged ${new Date(purgedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })}`
        : 'Never purged';

const CachingSection: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const updateCache = useUpdateLiveSourceCache(params);
    const purge = usePurgeLiveSourceCache(params);
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    const saved = String(getLiveSourceFreshness(connection).seconds);
    const [picked, setPicked] = useState(saved);
    const isDirty = picked !== saved;
    // A window set through the API may not be one of the presets.
    const seconds = WINDOW_SECONDS.includes(Number(saved))
        ? WINDOW_SECONDS
        : [...WINDOW_SECONDS, Number(saved)].sort((a, b) => a - b);
    return (
        <SettingsSection
            title="Caching"
            description="Everyone reuses a result until it expires, up to the project's cache duration."
        >
            <ProjectCacheOffAlert projectUuid={projectUuid} />
            <Group align="flex-end" gap="sm" wrap="nowrap">
                <Select
                    label="Reuse results for"
                    w={200}
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                    disabled={updateCache.isLoading}
                    value={picked}
                    onChange={(value) => value && setPicked(value)}
                    data={seconds.map((option) => ({
                        value: String(option),
                        label: formatFreshness(option),
                    }))}
                />
                <Button
                    disabled={!isDirty}
                    loading={updateCache.isLoading}
                    onClick={() =>
                        updateCache.mutate({ ttlSeconds: Number(picked) })
                    }
                >
                    Save changes
                </Button>
            </Group>
            <Divider />
            <Group justify="space-between" wrap="nowrap">
                <Text fz="sm">{formatPurgedAt(connection.cachePurgedAt)}</Text>
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconRefreshDot} />}
                    loading={purge.isLoading}
                    onClick={() => setIsPurgeOpen(true)}
                >
                    Purge cache
                </Button>
            </Group>
            <MantineModal
                opened={isPurgeOpen}
                onClose={() => setIsPurgeOpen(false)}
                title="Purge cached results?"
                role="alertdialog"
                description={`Results from "${connection.name}" stop being reused. The next query from anyone calls the integration for fresh data.`}
                confirmLabel="Purge cache"
                confirmLoading={purge.isLoading}
                onConfirm={() =>
                    purge.mutate(undefined, {
                        onSettled: () => setIsPurgeOpen(false),
                    })
                }
            />
        </SettingsSection>
    );
};

export const LiveSourceSettings: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** Null when this instance has no sign-in for the integration. */
    reconnect: (() => void) | null;
    /** The source's own form: its name, account and credentials. */
    details: ReactNode;
    onDelete: () => void;
}> = ({ projectUuid, connection, reconnect, details, onDelete }) => {
    const refreshFields = useRefreshLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    return (
        <Stack gap="md">
            <SettingsSection
                title="Details"
                action={
                    reconnect ? (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            onClick={reconnect}
                        >
                            Sign in again
                        </Button>
                    ) : null
                }
            >
                {details}
            </SettingsSection>
            <SettingsSection
                title="Fields"
                description="Read the fields the integration offers again, after it adds or renames some."
                action={
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconReload} />}
                        loading={refreshFields.isLoading}
                        onClick={() => refreshFields.mutate()}
                    >
                        Refresh fields
                    </Button>
                }
            />
            <CachingSection
                key={connection.cacheTtlSeconds ?? 'default'}
                projectUuid={projectUuid}
                connection={connection}
            />
            <SettingsSection
                title="Delete live data source"
                description="Disconnects it and removes its explores. Charts on it stop working until you reattach a source."
                action={
                    <Button
                        variant="outline"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Button>
                }
            />
        </Stack>
    );
};
