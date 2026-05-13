import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type DashboardChartsToolCallDescriptionProps = {
    dashboardName: string;
    page: number | null;
};

export const DashboardChartsToolCallDescription: FC<
    DashboardChartsToolCallDescriptionProps
> = ({ dashboardName, page }) => (
    <Text c="dimmed" size="xs">
        Looking up charts in dashboard{' '}
        <ToolCallChip mx={rem(2)}>{dashboardName}</ToolCallChip>
        {page !== null && page > 1 && ` (page ${page})`}
    </Text>
);
