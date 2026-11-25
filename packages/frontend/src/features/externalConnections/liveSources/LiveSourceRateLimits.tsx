/**
 * A live source's rate limits: Lightdash's calls against each limit, when each
 * resets, whether the vendor has paused it, and the lower limits an admin
 * sets. Usage is read when the page opens and after a save.
 */
import { type ExternalConnectionRateLimitUsage } from '@lightdash/common';
import { Box, Progress, Text } from '@mantine/core';
import { useState, type FC, type FormEvent } from 'react';
import { NumberInput } from '../../../components/common/NumberInput';
import {
    useExternalConnectionRateLimitUsage,
    useUpdateLiveSourceRateLimits,
} from '../hooks/useExternalConnectionRateLimitUsage';
import classes from './LiveSources.module.css';
import {
    SettingsCard,
    SettingsRow,
    SettingsSaveFooter,
} from './LiveSourceSettingsRows';
import {
    getMaxLimit,
    getRateLimitHint,
    getRateLimitMeter,
    getRateLimitRows,
    getSavedValues,
    isValidLimit,
    toRateLimitSettings,
    type RateLimitRow,
    type RateLimitValues,
} from './rateLimitForm';
import { formatUntil } from './rateLimitFormat';

type RateLimitParams = { projectUuid: string; connectionUuid: string };

const RowHint: FC<{
    row: RateLimitRow;
    value: number | undefined;
    checkedAt: string;
    isLimitReached: boolean;
}> = ({ row, value, checkedAt, isLimitReached }) => {
    if (!isValidLimit(row, value)) {
        return (
            <span className={classes.rateError}>
                Enter a whole number from 1 to{' '}
                {getMaxLimit(row).toLocaleString()}
            </span>
        );
    }
    return (
        <span
            className={classes.rateDetail}
            data-limit-reached={isLimitReached || undefined}
        >
            {getRateLimitHint(row, checkedAt)}
        </span>
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
                    checkedAt={usage.checkedAt}
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
            <Box className={classes.rateCount}>
                <Text inherit c={meter.isCounted ? undefined : 'dimmed'}>
                    {meter.text}
                </Text>
                {row.defaultLimit === null ? null : (
                    <Text className={classes.rateMax}>
                        Max {row.defaultLimit.toLocaleString()}
                    </Text>
                )}
            </Box>
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
        <SettingsCard
            title="Rate limits"
            titleInfo={usage.note ?? undefined}
            onSubmit={handleSubmit}
        >
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
            <SettingsSaveFooter
                isChanged={isChanged}
                isValid={isValid}
                isSaving={update.isLoading}
                onCancel={() => setEdits(null)}
            />
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
