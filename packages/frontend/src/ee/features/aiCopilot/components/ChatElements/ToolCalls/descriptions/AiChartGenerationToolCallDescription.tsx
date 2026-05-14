import { Group, rem, Stack, Text } from '@mantine-8/core';
import { ToolCallChip } from '../ToolCallChip';

export const AiChartGenerationToolCallDescription = ({
    title,
}: {
    title: string;
}) => {
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text c="dimmed" size="xs">
                    Generated chart{' '}
                    <ToolCallChip mx={rem(2)}>{title}</ToolCallChip>{' '}
                </Text>
            </Group>
        </Stack>
    );
};
