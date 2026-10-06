import {
    type AiCreditHold,
    type AiCreditUsageSummary,
} from '@lightdash/common';
import {
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { IconInfoCircle, IconPlayerPause } from '@tabler/icons-react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { type FC } from 'react';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { findBlockingAiCreditHold } from './aiCreditHolds';
import classes from './AiCreditsSettingsPage.module.css';
import { AiCreditsUsageBar } from './AiCreditsUsageBar';
import { AiCreditsUsageBreakdown } from './AiCreditsUsageBreakdown';
import { formatAllowance, formatCredits } from './creditUsage';
import { useAiCreditUsage } from './hooks/useAiCreditUsage';
import {
    getAllowanceUsedNotice,
    getPausedNotice,
    type UsageNotice,
    type UsageNoticeSeverity,
} from './usageNotice';

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

// When the contract ends with this period, the allowance doesn't reset.
const isContractEndingThisPeriod = ({
    period,
    contract,
}: Pick<AiCreditUsageSummary, 'period' | 'contract'>): boolean =>
    contract?.endsAt !== null &&
    contract?.endsAt !== undefined &&
    dayjs(contract.endsAt).isSame(period.periodEnd);

const getResumeDate = (
    usage: AiCreditUsageSummary,
    hold: AiCreditHold,
): string | null => {
    if (hold.reason === 'allowance_exhausted') {
        return isContractEndingThisPeriod(usage)
            ? null
            : formatDate(usage.period.periodEnd);
    }
    return hold.expiresAt === null ? null : formatDate(hold.expiresAt);
};

// Only a hold pauses AI, so without one the notice states the numbers and never claims a pause.
const getUsageNotice = (usage: AiCreditUsageSummary): UsageNotice | null => {
    const blockingHold = findBlockingAiCreditHold(usage);
    if (blockingHold !== null) {
        return getPausedNotice(
            blockingHold.reason,
            getResumeDate(usage, blockingHold),
        );
    }
    const allowance = usage.contract?.allowanceCredits ?? null;
    const overage = allowance === null ? 0 : usage.billable.credits - allowance;
    // Usage can pass the allowance without a hold, e.g. after the allowance is lowered.
    const isAllowanceUsed =
        overage > 0 ||
        usage.activeHolds.some((hold) => hold.reason === 'allowance_exhausted');
    if (!isAllowanceUsed) return null;
    return getAllowanceUsedNotice({
        keepsWorking: usage.contract?.allowanceMode === 'warn',
        overageCredits: overage > 0 ? formatCredits(overage) : null,
        endsOrResets: isContractEndingThisPeriod(usage)
            ? `Your contract ends on ${formatDate(usage.period.periodEnd)}.`
            : `It resets on ${formatDate(usage.period.periodEnd)}.`,
    });
};

const NOTICE_STYLE = {
    paused: { color: 'orange', icon: IconPlayerPause, role: 'alert' },
    // The theme's primary colour is the ink: black in light mode, white in dark.
    attention: { color: 'primary', icon: IconInfoCircle, role: 'status' },
} as const satisfies Record<UsageNoticeSeverity, unknown>;

const UsageSummary: FC<{ usage: AiCreditUsageSummary }> = ({ usage }) => {
    const { period, contract, billable } = usage;
    const allowance = contract?.allowanceCredits ?? null;
    const notice = getUsageNotice(usage);
    const noticeStyle = notice === null ? null : NOTICE_STYLE[notice.severity];

    return (
        <Paper
            p="md"
            className={classes.summary}
            data-severity={notice?.severity}
        >
            <Stack gap="sm">
                <Group justify="space-between" align="baseline">
                    <Title order={5} fz="sm" fw={500} c="ldGray.7">
                        {formatDate(period.periodStart)} –{' '}
                        {formatLastDay(period.periodEnd)}
                    </Title>
                    <Text fz="sm" c="dimmed">
                        {describePeriodLength(
                            contract?.resetIntervalMonths ?? 1,
                        )}
                    </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    {noticeStyle !== null && (
                        <ThemeIcon
                            variant="light"
                            color={noticeStyle.color}
                            radius="md"
                        >
                            <MantineIcon icon={noticeStyle.icon} />
                        </ThemeIcon>
                    )}
                    <Text fz="xl" fw={600}>
                        {formatCredits(billable.credits)}{' '}
                        <Text span inherit fw={400} c="dimmed">
                            {allowance !== null &&
                                `of ${formatAllowance(allowance)} `}
                            credits used
                        </Text>
                    </Text>
                </Group>
                {allowance !== null && allowance > 0 && (
                    <AiCreditsUsageBar
                        usedCredits={billable.credits}
                        allowanceCredits={allowance}
                    />
                )}
                {contract !== null && allowance === null && (
                    <Text fz="sm" c="dimmed">
                        No allowance is set for this contract yet, so usage
                        isn&apos;t measured against one.
                    </Text>
                )}
                {notice !== null && noticeStyle !== null ? (
                    <Stack gap={2} role={noticeStyle.role}>
                        <Text fz="sm" fw={500}>
                            {notice.title}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {notice.body}
                        </Text>
                    </Stack>
                ) : (
                    isContractEndingThisPeriod(usage) && (
                        <Text fz="sm" c="dimmed">
                            Your contract ends on {formatDate(period.periodEnd)}
                        </Text>
                    )
                )}
            </Stack>
        </Paper>
    );
};

const AiCreditsPageSkeleton: FC = () => (
    <Stack gap="lg" aria-busy="true" aria-label="Loading AI credit usage">
        <Paper p="md">
            <Stack gap="sm">
                <Skeleton h={16} w="30%" />
                <Skeleton h={24} w="45%" />
                <Skeleton h={8} radius="xl" />
            </Stack>
        </Paper>
        <Paper p="md">
            <Stack gap="md">
                <Skeleton h={16} w="25%" />
                <Skeleton h={200} />
            </Stack>
        </Paper>
    </Stack>
);

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
                <AiCreditsPageSkeleton />
            ) : isError || usage === undefined ? (
                <InlineErrorState
                    message="AI credit usage could not be loaded."
                    onRetry={() => void refetch()}
                />
            ) : (
                <Stack gap="lg">
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
