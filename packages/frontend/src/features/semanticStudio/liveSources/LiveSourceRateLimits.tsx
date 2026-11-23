/**
 * A live source's rate limits: Lightdash's calls against each limit the
 * integration declares, when each resets, and whether the vendor has paused
 * it. Read once when the page opens.
 */
import { type ExternalConnectionRateLimitUsage } from '@lightdash/common';
import { Box, Progress, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExternalConnectionRateLimitUsage } from '../../externalConnections/hooks/useExternalConnectionRateLimitUsage';
import classes from './LiveSources.module.css';
import {
    formatPacing,
    formatResetsAt,
    formatUntil,
    formatUsed,
} from './rateLimitFormat';

const USAGE_INFO =
    "Calls Lightdash made through this integration. Other apps on the same account aren't counted, so the vendor may allow fewer.";

const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);

const LimitRow: FC<{
    label: string;
    used: number;
    capacity: number;
    detail: string;
}> = ({ label, used, capacity, detail }) => {
    const isFull = used >= capacity;
    return (
        <Box className={classes.rateRow}>
            <span className={classes.rateLabel}>{label}</span>
            <Progress
                value={
                    capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0
                }
                color={isFull ? 'red' : undefined}
                size="sm"
                aria-label={`${label}: ${formatUsed(used, capacity)}`}
            />
            <span className={classes.rateCount}>
                {formatUsed(used, capacity)}
            </span>
            <span
                className={classes.rateDetail}
                data-limit-reached={isFull || undefined}
            >
                {detail}
            </span>
        </Box>
    );
};

const RateLimitRows: FC<{ usage: ExternalConnectionRateLimitUsage }> = ({
    usage,
}) => {
    const hasLimits = usage.buckets.length > 0 || usage.callsPerSecond !== null;
    return (
        <>
            <LimitRow
                label="Running now"
                used={usage.concurrent.used}
                capacity={usage.concurrent.limit}
                detail={
                    usage.concurrent.used >= usage.concurrent.limit
                        ? 'Others wait their turn'
                        : ''
                }
            />
            {usage.callsPerSecond !== null ? (
                <Box className={classes.rateRow}>
                    <span className={classes.rateLabel}>Paced</span>
                    <span className={classes.rateSpan}>
                        {formatPacing(usage.callsPerSecond)}
                    </span>
                </Box>
            ) : null}
            {usage.buckets.map((bucket) => {
                const isFull = bucket.used >= bucket.capacity;
                const resets = bucket.resetsAt
                    ? formatResetsAt(bucket.resetsAt, usage.checkedAt)
                    : 'No calls in this window';
                return (
                    <LimitRow
                        key={bucket.id}
                        label={capitalize(bucket.label)}
                        used={bucket.used}
                        capacity={bucket.capacity}
                        detail={isFull ? `Limit reached, ${resets}` : resets}
                    />
                );
            })}
            {!hasLimits ? (
                <Box className={classes.rateRow}>
                    <span className={classes.rateLabel}>Limits</span>
                    <span className={classes.rateSpan}>
                        No rate limits declared
                    </span>
                </Box>
            ) : null}
            <Box className={classes.rateRow}>
                <span className={classes.rateLabel}>
                    {usage.integrationLabel}
                </span>
                <span
                    className={classes.rateSpan}
                    data-paused={usage.limitedUntil ? true : undefined}
                >
                    {usage.limitedUntil
                        ? `Paused by ${usage.integrationLabel} ${formatUntil(
                              usage.limitedUntil,
                              usage.checkedAt,
                          )}`
                        : 'Not rate-limited'}
                </span>
            </Box>
            {usage.note ? (
                <Text className={classes.rateNote}>{usage.note}</Text>
            ) : null}
        </>
    );
};

export const LiveSourceRateLimits: FC<{
    projectUuid: string;
    connectionUuid: string;
}> = ({ projectUuid, connectionUuid }) => {
    const { data: usage, isError } = useExternalConnectionRateLimitUsage({
        projectUuid,
        connectionUuid,
    });
    return (
        <Box className={classes.rateLimits} aria-label="Rate limits">
            <Box className={classes.rateHeader}>
                <span className={classes.rateTitle}>Rate limits</span>
                <Tooltip label={USAGE_INFO} multiline maw={280} withinPortal>
                    <span className={classes.rateSubtitle}>
                        Lightdash's usage
                        <MantineIcon icon={IconInfoCircle} size={12} />
                    </span>
                </Tooltip>
            </Box>
            {usage ? (
                <RateLimitRows usage={usage} />
            ) : isError ? (
                <Text className={classes.rateNote}>
                    Couldn't read rate-limit usage. Reload the page to try
                    again.
                </Text>
            ) : (
                <Text className={classes.rateNote}>Loading…</Text>
            )}
        </Box>
    );
};
