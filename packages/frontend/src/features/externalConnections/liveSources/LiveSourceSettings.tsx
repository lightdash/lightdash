/**
 * One live data source's settings, below its summary and explores on its
 * own page: a card per subject, most used first. Each card only reads; Edit
 * opens its rows as fields in a dialog. Caching alone saves as it is changed.
 */
import { Button, Stack } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { LiveSourceAccessCard } from './LiveSourceAccessCard';
import { LiveSourceAuthCard } from './LiveSourceAuthCard';
import { LiveSourceCachingCard } from './LiveSourceCachingCard';
import { LiveSourceDetailsCard } from './LiveSourceDetailsCard';
import { LiveSourceRateLimitsCard } from './LiveSourceRateLimits';
import { type LiveSourceConnection } from './liveSourceRows';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceUsageCard } from './LiveSourceUsageCard';
import { useLiveSourceForm } from './useLiveSourceForm';

export const LiveSourceSettings: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    /** Null when this instance has no sign-in for the integration. */
    reconnect: (() => void) | null;
    onDelete: () => void;
}> = ({ projectUuid, connection, reconnect, onDelete }) => {
    // Details and Authentication save into one payload, so they share a form
    const source = useLiveSourceForm(projectUuid, connection);
    return (
        <Stack gap="lg">
            <LiveSourceDetailsCard connection={connection} source={source} />
            <LiveSourceUsageCard
                projectUuid={projectUuid}
                connection={connection}
            />
            <LiveSourceCachingCard
                projectUuid={projectUuid}
                connection={connection}
            />
            <LiveSourceRateLimitsCard
                projectUuid={projectUuid}
                connectionUuid={connection.externalConnectionUuid}
            />
            <LiveSourceAccessCard
                projectUuid={projectUuid}
                connection={connection}
            />
            <LiveSourceAuthCard
                projectUuid={projectUuid}
                connection={connection}
                source={source}
                reconnect={reconnect}
            />
            <SettingsCard title="Danger zone" tone="danger">
                <SettingsRow
                    label="Delete live data source"
                    hint="Charts that use it will stop working"
                >
                    <Button
                        size="xs"
                        variant="default"
                        c="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Button>
                </SettingsRow>
            </SettingsCard>
        </Stack>
    );
};
