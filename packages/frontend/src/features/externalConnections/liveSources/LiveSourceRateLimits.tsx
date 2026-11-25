/**
 * A live source's rate limits: Lightdash's calls against each limit, when each
 * resets, whether the vendor has paused it, and the lower limits an admin
 * sets. Usage is read when the page opens and after a save.
 */
import {
    assertUnreachable,
    type ExternalConnectionRateLimitUsage,
} from '@lightdash/common';
import { Button, Group, Progress, Text } from '@mantine/core';
import { useState, type FC, type FormEvent } from 'react';
import { NumberInput } from '../../../components/common/NumberInput';
import {
    useExternalConnectionRateLimitUsage,
    useUpdateLiveSourceRateLimits,
} from '../hooks/useExternalConnectionRateLimitUsage';
import classes from './LiveSources.module.css';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import rowClasses from './LiveSourceSettingsRows.module.css';
import {
    getMaxLimit,
    getRateLimitMeter,
    getRateLimitRows,
    getSavedValues,
    isBelowQueryCalls,
    isValidLimit,
    toRateLimitSettings,
    type RateLimitRow,
    type RateLimitValues,
} from './rateLimitForm';
import { capitalize, formatUntil, isFull, resetsOf } from './rateLimitFormat';

type RateLimitParams = { projectUuid: string; connectionUuid: string };

const getRowStatus = (
    row: RateLimitRow,
    usage: ExternalConnectionRateLimitUsage,
) => {
    switch (row.kind) {
        case 'window': {
            if (!row.usage) {
                return 'No limit set';
            }
            const resets = resetsOf(row.usage, usage.checkedAt);
            return isFull(row.usage)
                ? `Limit reached, ${resets}`
                : capitalize(resets);
        }
        case 'callsPerSecond':
            return 'Throttled to this rate';
        case 'concurrentCalls':
            return usage.runningCalls > 0 ? 'In flight now' : 'None in flight';
        default:
            return assertUnreachable(row, 'Unknown rate limit row');
    }
};

const RowHint: FC<{
    row: RateLimitRow;
    value: number | undefined;
    usage: ExternalConnectionRateLimitUsage;
    isLimitReached: boolean;
}> = ({ row, value, usage, isLimitReached }) => {
    if (!isValidLimit(row, value)) {
        return (
            <span className={classes.rateError}>
                Enter a whole number from 1 to{' '}
                {getMaxLimit(row).toLocaleString()}
            </span>
        );
    }
    return (
        <>
            <span
                className={classes.rateDetail}
                data-limit-reached={isLimitReached || undefined}
            >
                {getRowStatus(row, usage)}
            </span>
            {isBelowQueryCalls(row, value, usage.callsPerQuery) ? (
                <span className={classes.warningText}>
                    {' '}
                    · One query can make up to {usage.callsPerQuery} requests
                </span>
            ) : null}
        </>
    );
};

const LimitRow: FC<{
    row: RateLimitRow;
    value: number | undefined;
    usage: ExternalConnectionRateLimitUsage;
    onChange: (value: number | undefined) => void;
}> = ({ row, value, usage, onChange }) => {
    const meter = getRateLimitMeter(row, usage.runningCalls);
    return (
        <SettingsRow
            label={row.label}
            hint={
                <RowHint
                    row={row}
                    value={value}
                    usage={usage}
                    isLimitReached={meter.isFull}
                />
            }
        >
            <Progress
                w={100}
                size="sm"
                value={meter.percent}
                color={meter.isFull ? 'red' : undefined}
                aria-label={`${row.label}: ${meter.text}`}
            />
            <Text
                className={classes.rateCount}
                c={meter.isCounted ? undefined : 'dimmed'}
            >
                {meter.text}
            </Text>
            <NumberInput
                w={96}
                size="xs"
                aria-label={`${row.label} limit`}
                placeholder={row.defaultLimit?.toLocaleString() ?? 'No limit'}
                min={1}
                clampBehavior="none"
                allowNegative={false}
                thousandSeparator=","
                hideControls
                error={!isValidLimit(row, value)}
                value={value ?? ''}
                onNumberChange={onChange}
            />
        </SettingsRow>
    );
};

const RateLimitsForm: FC<
    RateLimitParams & { usage: ExternalConnectionRateLimitUsage }
> = ({ usage, ...params }) => {
    const update = useUpdateLiveSourceRateLimits(params);
    /** Null until a field is edited, so the fields follow what is saved. */
    const [edits, setEdits] = useState<RateLimitValues | null>(null);
    const rows = getRateLimitRows(usage);
    const saved = getSavedValues(rows);
    const values = edits ?? saved;
    const isChanged = rows.some(({ key }) => values[key] !== saved[key]);
    const isValid = rows.every((row) => isValidLimit(row, values[row.key]));

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (!isChanged || !isValid) {
            return;
        }
        update.mutate(toRateLimitSettings(rows, values), {
            onSuccess: () => setEdits(null),
        });
    };

    return (
        <SettingsCard title="Rate limits" onSubmit={handleSubmit}>
            {usage.limitedUntil ? (
                <SettingsRow
                    label={`Paused by ${usage.integrationLabel}`}
                    hint={`Requests resume ${formatUntil(
                        usage.limitedUntil,
                        usage.checkedAt,
                    )}`}
                >
                    {null}
                </SettingsRow>
            ) : null}
            {rows.map((row) => (
                <LimitRow
                    key={row.key}
                    row={row}
                    value={values[row.key]}
                    usage={usage}
                    onChange={(value) =>
                        setEdits({ ...values, [row.key]: value })
                    }
                />
            ))}
            {usage.note ? (
                <Text className={classes.rateNote}>{usage.note}</Text>
            ) : null}
            <Group
                justify="flex-end"
                gap="xs"
                className={rowClasses.settingsFooter}
            >
                <Button
                    size="xs"
                    variant="default"
                    disabled={!isChanged || update.isLoading}
                    onClick={() => setEdits(null)}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    size="xs"
                    disabled={!isChanged || !isValid}
                    loading={update.isLoading}
                >
                    Save changes
                </Button>
            </Group>
        </SettingsCard>
    );
};

/** One row per limit an admin can lower, plus the vendor's pause while it lasts. */
export const LiveSourceRateLimitsCard: FC<RateLimitParams> = (params) => {
    const { data: usage, isError } =
        useExternalConnectionRateLimitUsage(params);
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
    if (!usage) {
        return null;
    }
    return <RateLimitsForm {...params} usage={usage} />;
};
