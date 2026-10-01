import { type AiCreditUsageSummary } from '@lightdash/common';
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { findBlockingAiCreditHold } from './aiCreditHolds';
import { AiCreditsPausedCallout } from './AiCreditsPausedCallout';
import { AiCreditsUsageBar } from './AiCreditsUsageBar';
import { AiCreditsUsageBreakdown } from './AiCreditsUsageBreakdown';
import { useAiCreditUsage } from './hooks/useAiCreditUsage';

const creditFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
});

dayjs.extend(utc);

// Contract windows are UTC calendar dates, so they read the same in every timezone.
const formatDate = (value: Date) => dayjs.utc(value).format('D MMM YYYY');

// Periods end at the instant the next one starts, so the last day shown is the day before.
const formatLastDay = (periodEnd: Date) =>
    dayjs.utc(periodEnd).subtract(1, 'millisecond').format('D MMM YYYY');

const describePeriodLength = (months: number): string => {
    if (months === 1) return 'Monthly';
    if (months === 3) return 'Quarterly';
    if (months === 12) return 'Yearly';
    return `Every ${months} months`;
};

const UsageSummary: FC<{ usage: AiCreditUsageSummary }> = ({ usage }) => {
    const { period, contract, billable } = usage;
    const allowance = contract?.allowanceCredits ?? null;
    const isContractEnd =
        contract?.endsAt !== null &&
        contract?.endsAt !== undefined &&
        dayjs(contract.endsAt).isSame(period.periodEnd);

    return (
        <Paper p="md">
            <Stack gap="sm">
                <Group justify="space-between" align="baseline">
                    <Title order={5}>This period</Title>
                    <Text fz="sm" c="dimmed">
                        {formatDate(period.periodStart)} –{' '}
                        {formatLastDay(period.periodEnd)} ·{' '}
                        {describePeriodLength(
                            contract?.resetIntervalMonths ?? 1,
                        )}
                    </Text>
                </Group>
                <Text fz="xl" fw={600}>
                    {creditFormat.format(billable.credits)}
                    {allowance !== null &&
                        ` of ${creditFormat.format(allowance)}`}{' '}
                    credits used
                </Text>
                {allowance !== null && allowance > 0 && (
                    <AiCreditsUsageBar
                        percent={(billable.credits / allowance) * 100}
                    />
                )}
                {isContractEnd && (
                    <Text fz="sm" c="dimmed">
                        Your contract ends on {formatDate(period.periodEnd)}
                    </Text>
                )}
            </Stack>
        </Paper>
    );
};

// Usage past the allowance is never blocked, so this is a heads-up, not an alert.
const AllowanceUsedBanner: FC<{ usage: AiCreditUsageSummary }> = ({
    usage,
}) => {
    const blockingHold = findBlockingAiCreditHold(usage);
    if (blockingHold !== null) {
        return <AiCreditsPausedCallout hold={blockingHold} />;
    }
    const isAllowanceUsed = usage.activeHolds.some(
        (hold) => hold.reason === 'allowance_exhausted',
    );
    if (!isAllowanceUsed) return null;
    return (
        <Callout variant="neutral" title="You've used this period's allowance">
            No worries, your usage isn&apos;t blocked. Your allowance resets on{' '}
            {formatDate(usage.period.periodEnd)}.
        </Callout>
    );
};

export const AiCreditsSettingsPage: FC = () => {
    const {
        data: usage,
        isInitialLoading,
        isError,
        refetch,
    } = useAiCreditUsage({ enabled: true });

    return (
        <SettingsPage
            title="AI credits"
            description="Credits your organization has used on AI features in the current period."
        >
            {isInitialLoading ? (
                <EmptyStateLoader />
            ) : isError || usage === undefined ? (
                <InlineErrorState
                    message="AI credit usage could not be loaded."
                    onRetry={() => void refetch()}
                />
            ) : (
                <Stack gap="lg">
                    <AllowanceUsedBanner usage={usage} />
                    <UsageSummary usage={usage} />
                    <AiCreditsUsageBreakdown
                        allowanceCredits={
                            usage.contract?.allowanceCredits ?? null
                        }
                        usedCredits={usage.billable.credits}
                    />
                </Stack>
            )}
        </SettingsPage>
    );
};
