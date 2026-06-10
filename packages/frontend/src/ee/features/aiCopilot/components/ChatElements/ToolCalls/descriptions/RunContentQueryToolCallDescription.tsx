import type { ToolRunContentQueryArgs } from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type RunContentQueryToolCallDescriptionProps = {
    source: ToolRunContentQueryArgs['source'];
};

export const RunContentQueryToolCallDescription: FC<
    RunContentQueryToolCallDescriptionProps
> = ({ source }) => {
    if (source.type === 'metricQuery') {
        return (
            <Text c="dimmed" size="xs">
                Ran metric query on{' '}
                <ToolCallChip mx={rem(2)}>{source.tableName}</ToolCallChip>
            </Text>
        );
    }

    if (source.type === 'dashboardChart') {
        return (
            <Text c="dimmed" size="xs">
                Ran dashboard chart{' '}
                <ToolCallChip mx={rem(2)}>{source.chartSlug}</ToolCallChip>
                from{' '}
                <ToolCallChip mx={rem(2)}>{source.dashboardSlug}</ToolCallChip>
                {source.limit ? (
                    <ToolCallChip mx={rem(2)}>
                        limit {source.limit}
                    </ToolCallChip>
                ) : null}
            </Text>
        );
    }

    return (
        <Text c="dimmed" size="xs">
            Ran saved chart{' '}
            <ToolCallChip mx={rem(2)}>{source.chartSlug}</ToolCallChip>
            {source.limit ? (
                <ToolCallChip mx={rem(2)}>limit {source.limit}</ToolCallChip>
            ) : null}
        </Text>
    );
};
