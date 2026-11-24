/**
 * A live source's rate limits: Lightdash's calls against each limit the
 * integration declares, when each resets, and whether the vendor has paused
 * it. Read once when the page opens.
 */
import { Progress, Text } from '@mantine/core';
import { type FC } from 'react';
import { useExternalConnectionRateLimitUsage } from '../hooks/useExternalConnectionRateLimitUsage';
import classes from './LiveSources.module.css';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import {
    capitalize,
    formatUntil,
    formatUsed,
    isFull,
    resetsOf,
} from './rateLimitFormat';

/** One row per declared limit, plus the vendor's pause while it lasts. */
export const LiveSourceRateLimitsCard: FC<{
    projectUuid: string;
    connectionUuid: string;
}> = ({ projectUuid, connectionUuid }) => {
    const { data: usage, isError } = useExternalConnectionRateLimitUsage({
        projectUuid,
        connectionUuid,
    });
    if (isError) {
        return (
            <SettingsCard title="Rate limits">
                <SettingsRow
                    label="Usage"
                    hint="Couldn't read rate-limit usage. Reload the page to try again."
                >
                    {null}
                </SettingsRow>
            </SettingsCard>
        );
    }
    if (!usage || (usage.buckets.length === 0 && !usage.limitedUntil)) {
        return null;
    }
    return (
        <SettingsCard title="Rate limits">
            {usage.limitedUntil ? (
                <SettingsRow
                    label={`Paused by ${usage.integrationLabel}`}
                    hint={`Calls resume ${formatUntil(
                        usage.limitedUntil,
                        usage.checkedAt,
                    )}`}
                >
                    {null}
                </SettingsRow>
            ) : null}
            {usage.buckets.map((bucket) => {
                const full = isFull(bucket);
                const resets = resetsOf(bucket, usage.checkedAt);
                return (
                    <SettingsRow
                        key={bucket.id}
                        label={capitalize(bucket.label)}
                        hint={
                            <span
                                className={classes.rateDetail}
                                data-limit-reached={full || undefined}
                            >
                                {full ? `Limit reached, ${resets}` : resets}
                            </span>
                        }
                    >
                        <Progress
                            w={160}
                            size="sm"
                            value={
                                bucket.capacity > 0
                                    ? Math.min(
                                          100,
                                          (bucket.used / bucket.capacity) * 100,
                                      )
                                    : 0
                            }
                            color={full ? 'red' : undefined}
                            aria-label={`${bucket.label}: ${formatUsed(bucket.used, bucket.capacity)}`}
                        />
                        <Text className={classes.rateCount}>
                            {formatUsed(bucket.used, bucket.capacity)}
                        </Text>
                    </SettingsRow>
                );
            })}
        </SettingsCard>
    );
};
