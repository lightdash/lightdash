import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

type DashboardChartsToolCallDescriptionProps = {
    dashboardName: string;
    page: number | null;
};

export const DashboardChartsToolCallDescription: FC<
    DashboardChartsToolCallDescriptionProps
> = ({ dashboardName, page }) => (
    <Text c="dimmed" size="xs">
        Looking up charts in dashboard{' '}
        <Badge
            color="gray"
            variant="light"
            size="xs"
            mx={rem(2)}
            radius="sm"
            style={{
                textTransform: 'none',
                fontWeight: 400,
            }}
        >
            {dashboardName}
        </Badge>
        {page !== null && page > 1 && ` (page ${page})`}
    </Text>
);
