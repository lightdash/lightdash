import {
    Badge,
    Button,
    Group,
    HoverCard,
    rem,
    Stack,
    Text,
} from '@mantine-8/core';
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
