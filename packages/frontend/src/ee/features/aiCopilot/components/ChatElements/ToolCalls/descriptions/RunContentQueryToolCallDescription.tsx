import type { ToolRunContentQueryArgs } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type RunContentQueryToolCallDescriptionProps = {
    source: ToolRunContentQueryArgs['source'];
};

export const RunContentQueryToolCallDescription: FC<
    RunContentQueryToolCallDescriptionProps
> = ({ source }) => {
    const { t } = useTranslation('aiCopilotChat');
    if (source.type === 'metricQuery') {
        return (
            <Text c="dimmed" size="xs">
                {t('toolDescriptions.runContent.metricQueryOn')}{' '}
                <ToolCallChip mx={rem(2)}>{source.tableName}</ToolCallChip>
            </Text>
        );
    }

    if (source.type === 'dashboardChart') {
        return (
            <Text c="dimmed" size="xs">
                {t('toolDescriptions.runContent.dashboardChart')}{' '}
                <ToolCallChip mx={rem(2)}>{source.chartSlug}</ToolCallChip>
                {t('toolDescriptions.from')}{' '}
                <ToolCallChip mx={rem(2)}>{source.dashboardSlug}</ToolCallChip>
                {source.limit ? (
                    <ToolCallChip mx={rem(2)}>
                        {t('toolDescriptions.runContent.limit', {
                            limit: source.limit,
                        })}
                    </ToolCallChip>
                ) : null}
            </Text>
        );
    }

    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.runContent.savedChart')}{' '}
            <ToolCallChip mx={rem(2)}>{source.chartSlug}</ToolCallChip>
            {source.limit ? (
                <ToolCallChip mx={rem(2)}>
                    {t('toolDescriptions.runContent.limit', {
                        limit: source.limit,
                    })}
                </ToolCallChip>
            ) : null}
        </Text>
    );
};
