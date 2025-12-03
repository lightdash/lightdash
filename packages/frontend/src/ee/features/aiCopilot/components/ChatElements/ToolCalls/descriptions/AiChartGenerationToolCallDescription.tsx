import { Badge, Group, rem, Stack, Text } from '@mantine-8/core';

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
                    <Badge
                        mx={rem(2)}
                        color="gray"
                        variant="light"
                        size="xs"
                        radius="sm"
                        style={{
                            textTransform: 'none',
                            fontWeight: 400,
                        }}
                    >
                        {title}
                    </Badge>{' '}
                </Text>
            </Group>
        </Stack>
    );
};
