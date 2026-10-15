import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type DashboardChartsToolCallDescriptionProps = {
    dashboardName: string;
    page: number | null;
};

export const DashboardChartsToolCallDescription: FC<
    DashboardChartsToolCallDescriptionProps
> = ({ dashboardName, page }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            <Trans
                t={t}
                i18nKey="toolDescriptions.dashboardCharts"
                values={{ dashboardName }}
                components={{
                    chip: (
                        <ToolCallChip mx={rem(2)}>{dashboardName}</ToolCallChip>
                    ),
                }}
            />
            {page !== null &&
                page > 1 &&
                ` ${t('toolDescriptions.pageSuffix', { page })}`}
        </Text>
    );
};
