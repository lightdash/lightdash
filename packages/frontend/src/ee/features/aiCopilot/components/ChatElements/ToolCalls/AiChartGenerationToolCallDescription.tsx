import { Badge, Button, Group, HoverCard, Stack, Text } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconEye } from '@tabler/icons-react';
import MantineIcon from '../../../../../../components/common/MantineIcon';

export const AiChartGenerationToolCallDescription = ({
    title,
    dimensions,
    metrics,
    breakdownByDimension,
    sql,
}: {
    title: string;
    dimensions: string[];
    metrics: string[];
    breakdownByDimension?: string | null;
    sql: string | undefined;
}) => {
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text c="dimmed" size="xs">
                    Generated chart{' '}
                    <Badge
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
                    with fields {}
                    <Badge
                        color="gray"
                        variant="light"
                        size="xs"
                        radius="sm"
                        style={{
                            textTransform: 'none',
                            fontWeight: 400,
                        }}
                    >
                        {dimensions.join(', ')}
                    </Badge>{' '}
                    {metrics.map((metric) => (
                        <Badge
                            key={metric}
                            color="gray"
                            variant="light"
                            size="xs"
                            radius="sm"
                            style={{
                                textTransform: 'none',
                                fontWeight: 400,
                            }}
                        >
                            {metric}
                        </Badge>
                    ))}
                    {breakdownByDimension && (
                        <>
                            and breakdown by{' '}
                            <Badge
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

            {sql && (
                <HoverCard
                    shadow="subtle"
                    radius="md"
                    position="bottom-start"
                    withinPortal
                >
                    <HoverCard.Target>
                        <Group justify="start">
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray.6"
                                leftSection={
                                    <MantineIcon
                                        icon={IconEye}
                                        size={12}
                                        stroke={1.5}
                                    />
                                }
                            >
                                SQL
                            </Button>
                        </Group>
                    </HoverCard.Target>
                    <HoverCard.Dropdown p={0} maw={500}>
                        <Prism
                            language="sql"
                            withLineNumbers
                            noCopy
                            styles={{
                                lineContent: {
                                    fontSize: 10,
                                },
                            }}
                        >
                            {sql}
                        </Prism>
                    </HoverCard.Dropdown>
                </HoverCard>
            )}
        </Stack>
    );
};
