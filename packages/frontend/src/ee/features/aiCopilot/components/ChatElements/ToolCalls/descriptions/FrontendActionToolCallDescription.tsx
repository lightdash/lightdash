import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type FrontendActionToolCallDescriptionProps = {
    action: string;
};

export const FrontendActionToolCallDescription: FC<
    FrontendActionToolCallDescriptionProps
> = ({ action }) => {
    return (
        <Text c="dimmed" size="xs">
            <ToolCallChip mx={rem(2)}>{action}</ToolCallChip>
        </Text>
    );
};
