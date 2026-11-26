/**
 * How long a live data source's results are reused, how often they are, and
 * clearing them. The duration is one choice with nothing to review, so it
 * saves as soon as it is made.
 */
import { LIVE_SOURCE_CACHE_TTL_MAX_SECONDS } from '@lightdash/common';
import { Button, Select } from '@mantine/core';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';
import { useExternalConnectionApiUsage } from '../hooks/useExternalConnectionApiUsage';
import {
    usePurgeLiveSourceCache,
    useUpdateLiveSourceCache,
} from '../hooks/useLiveSourceCache';
import {
    formatFreshness,
    getLiveSourceFreshness,
    toLiveSourceRow,
    type LiveSourceConnection,
} from './liveSourceRows';
import classes from './LiveSources.module.css';
import {
    SettingsCard,
    SettingsRow,
    SettingsValue,
} from './LiveSourceSettingsRows';

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

const formatDate = (date: Date | string) =>
    new Date(date).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

export const LiveSourceCachingCard: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
}> = ({ projectUuid, connection }) => {
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const purge = usePurgeLiveSourceCache(params);
    const updateCache = useUpdateLiveSourceCache(params);
    const { data: projectCache } = useResultsCacheStatus(projectUuid);
    const { data: apiUsage } = useExternalConnectionApiUsage(projectUuid);
    const { usage } = toLiveSourceRow(connection, apiUsage);
    const [isPurgeOpen, setIsPurgeOpen] = useState(false);
    /** Seconds, as the select holds it. */
    const [ttl, setTtl] = useState(() =>
        String(getLiveSourceFreshness(connection)),
    );
    // A window set through the API may not be one of the presets.
    const [ttlOptions] = useState(() =>
        WINDOW_SECONDS.includes(Number(ttl))
            ? WINDOW_SECONDS
            : [...WINDOW_SECONDS, Number(ttl)].sort((a, b) => a - b),
    );

    const saveTtl = (next: string | null) => {
        if (next === null || next === ttl) return;
        const saved = ttl;
        setTtl(next);
        updateCache.mutate(
            { ttlSeconds: Number(next) },
            { onError: () => setTtl(saved) },
        );
    };

    // The project doesn't cache results, so the source has nothing to tune or clear
    if (projectCache?.enabled === false) {
        return (
            <SettingsCard title="Caching">
                <SettingsRow
                    label="Caching"
                    hint={
                        <span className={classes.warningText}>
                            Off for this project
                        </span>
                    }
                >
                    <Button
                        size="xs"
                        variant="default"
                        component={Link}
                        to={`/generalSettings/projectManagement/${projectUuid}/caching`}
                    >
                        Turn on
                    </Button>
                </SettingsRow>
            </SettingsCard>
        );
    }
    return (
        <>
            <SettingsCard title="Caching">
                <SettingsRow
                    label="Duration"
                    hint="How long results are reused"
                >
                    <Select
                        w={116}
                        size="xs"
                        aria-label="Caching"
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        data={ttlOptions.map((option) => ({
                            value: String(option),
                            label:
                                option === 0
                                    ? 'No caching'
                                    : formatFreshness(option),
                        }))}
                        disabled={updateCache.isLoading}
                        value={ttl}
                        onChange={saveTtl}
                    />
                </SettingsRow>
                <SettingsRow label="Hit rate" hint="Queries served from cache">
                    <SettingsValue isNumber isEmpty={usage.hitRate === null}>
                        {usage.hitRate ?? '—'}
                    </SettingsValue>
                </SettingsRow>
                <SettingsRow
                    label="Last cleared"
                    hint="Results from before this are not reused"
                >
                    <SettingsValue isEmpty={!connection.cachePurgedAt}>
                        {connection.cachePurgedAt
                            ? formatDate(connection.cachePurgedAt)
                            : 'Never'}
                    </SettingsValue>
                </SettingsRow>
                <SettingsRow
                    label="Clear cache"
                    hint="The next query fetches fresh data"
                >
                    <Button
                        size="xs"
                        variant="default"
                        loading={purge.isLoading}
                        onClick={() => setIsPurgeOpen(true)}
                    >
                        Clear
                    </Button>
                </SettingsRow>
            </SettingsCard>
            <MantineModal
                opened={isPurgeOpen}
                onClose={() => setIsPurgeOpen(false)}
                title="Clear cache?"
                role="alertdialog"
                description={`The next query to "${connection.name}" fetches fresh data.`}
                confirmLabel="Clear"
                confirmLoading={purge.isLoading}
                onConfirm={() =>
                    purge.mutate(undefined, {
                        onSettled: () => setIsPurgeOpen(false),
                    })
                }
            />
        </>
    );
};
