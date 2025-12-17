import { FeatureFlags } from '@lightdash/common';
import { Skeleton, Stack } from '@mantine-8/core';
import type { FC } from 'react';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import SuboptimalState from './SuboptimalState/SuboptimalState';

const LegacyLoadingChart: FC<{ className?: string }> = ({ className }) => (
    <div
        className={className}
        style={{ height: '100%', width: '100%', padding: '50px 0' }}
    >
        <SuboptimalState title="Loading chart" loading />
    </div>
);

const ChartSkeleton: FC<{ className?: string }> = ({ className }) => (
    <Stack gap="xs" h="100%" className={className}>
        <Skeleton h={16} w="90%" radius="xl" />
        <Skeleton h={14} w="80%" radius="xl" />
        <Skeleton h="100%" w="100%" radius="md" mt="md" />
    </Stack>
);

export const ChartLoadingSkeleton: FC<{ className?: string }> = ({
    className = 'loading_chart',
}) => {
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    if (!isDashboardRedesignEnabled) {
        return <LegacyLoadingChart className={className} />;
    }

    return <ChartSkeleton className={className} />;
};
