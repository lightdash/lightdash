import { Badge, Group, rem, Stack, Text } from '@mantine-8/core';

export const AiChartGenerationToolCallDescription = ({
    title,
    dimensions,
    metrics,
    breakdownByDimension,
}: {
    title: string;
    dimensions: string[];
    metrics: string[];
    breakdownByDimension?: string | null;
}) => {
    const fields = [...dimensions, ...metrics];

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
                    {fields.length > 0 && (
                        <>
                            with fields{' '}
                            {fields.map((field) => (
                                <Badge
                                    key={field}
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
                                    {field}
                                </Badge>
                            ))}
                        </>
                    )}
                    {breakdownByDimension && (
                        <>
                            {' '}
                            and breakdown by{' '}
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
                                {breakdownByDimension}
                            </Badge>
                        </>
                    )}
                </Text>
            </Group>
        </Stack>
    );
};
