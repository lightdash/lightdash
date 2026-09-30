import {
    type AiCreditUsageBreakdownRow,
    type AiCreditUsageSummary,
} from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    Progress,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { useAiCreditUsage } from './hooks/useAiCreditUsage';
import { getAiCreditChannelLabel, getAiCreditFeatureLabel } from './labels';

const creditFormat = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
});

dayjs.extend(utc);

// Contract windows are UTC calendar dates, so they read the same in every timezone.
const formatDate = (value: Date) => dayjs.utc(value).format('D MMM YYYY');

// Periods end at the instant the next one starts, so the last day shown is the day before.
const formatLastDay = (periodEnd: Date) =>
    dayjs.utc(periodEnd).subtract(1, 'millisecond').format('D MMM YYYY');

const describeResetInterval = (months: number): string => {
    if (months === 1) return 'Resets monthly';
    if (months === 3) return 'Resets quarterly';
    if (months === 12) return 'Resets yearly';
    return `Resets every ${months} months`;
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
                        {formatLastDay(period.periodEnd)}
                    </Text>
                </Group>
                <Text fz="xl" fw={600}>
                    {creditFormat.format(billable.credits)}
                    {allowance !== null &&
                        ` of ${creditFormat.format(allowance)}`}{' '}
                    credits used
                </Text>
                {allowance !== null && allowance > 0 && (
                    <Progress
                        value={Math.min(
                            (billable.credits / allowance) * 100,
                            100,
                        )}
                        aria-label="Credits used"
                    />
                )}
                <Text fz="sm" c="dimmed">
                    {isContractEnd
                        ? `Your contract ends on ${formatDate(period.periodEnd)}`
                        : `${describeResetInterval(
                              contract?.resetIntervalMonths ?? 1,
                          )} · next reset on ${formatDate(period.periodEnd)}`}
                </Text>
            </Stack>
        </Paper>
    );
};

// Usage past the allowance is never blocked, so this is a heads-up, not an alert.
const AllowanceUsedBanner: FC<{ usage: AiCreditUsageSummary }> = ({
    usage,
}) => {
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

const BreakdownCard: FC<{
    title: string;
    rows: AiCreditUsageBreakdownRow[];
    getLabel: (key: string) => string;
}> = ({ title, rows, getLabel }) => {
    const maxCredits = Math.max(...rows.map((row) => row.credits), 0);
    return (
        <Paper p="md">
            <Title order={5} mb="sm">
                {title}
            </Title>
            {rows.length === 0 ? (
                <Text fz="sm" c="dimmed">
                    No usage yet this period
                </Text>
            ) : (
                <Stack gap="sm">
                    {rows.map((row) => (
                        <Box key={row.key}>
                            <Group justify="space-between" gap="xs" mb={4}>
                                <Text fz="sm">{getLabel(row.key)}</Text>
                                <Text fz="sm" c="dimmed">
                                    {creditFormat.format(row.credits)}
                                </Text>
                            </Group>
                            <Progress
                                size="sm"
                                value={
                                    maxCredits > 0
                                        ? (row.credits / maxCredits) * 100
                                        : 0
                                }
                                aria-label={getLabel(row.key)}
                            />
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
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
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                        <BreakdownCard
                            title="By feature"
                            rows={usage.byFeature}
                            getLabel={getAiCreditFeatureLabel}
                        />
                        <BreakdownCard
                            title="By channel"
                            rows={usage.byChannel}
                            getLabel={getAiCreditChannelLabel}
                        />
                    </SimpleGrid>
                </Stack>
            )}
        </SettingsPage>
    );
};
