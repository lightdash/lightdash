import {
    Badge,
    Group,
    HoverCard,
    Stack,
    Text,
    type HoverCardProps,
} from '@mantine/core';
import { useMemo, type FC, type PropsWithChildren } from 'react';

type SegmentedControlHoverCardProps = PropsWithChildren<HoverCardProps> & {
    totalMetricsCount: number;
    isValidMetricsNodeCount: boolean;
    isValidMetricsEdgeCount: boolean;
};

const SegmentedControlHoverCard: FC<SegmentedControlHoverCardProps> = ({
    children,
    totalMetricsCount,
    isValidMetricsNodeCount,
    isValidMetricsEdgeCount,
    ...props
}) => {
    const segmentedControlTooltipLabel = useMemo(() => {
        if (totalMetricsCount === 0) {
            return (
                <Text size="xs" c="white">
                    There are no metrics to display in the metrics tree
                </Text>
            );
        }

        if (!isValidMetricsNodeCount) {
            return (
                <Text size="xs" c="white">
                    Tree view is only available for lists with fewer than{' '}
                    <Text span fw="bold">
                        30 metrics
                    </Text>
                    . Use categories to filter your list down to access it.
                </Text>
            );
        }

        if (!isValidMetricsEdgeCount) {
            return (
                <Text size="xs" c="white">
                    There are no connections between the selected metrics
                </Text>
            );
        }

        return null;
    }, [isValidMetricsEdgeCount, isValidMetricsNodeCount, totalMetricsCount]);

    return (
        <HoverCard
            {...props}
            styles={{
                arrow: { border: 'none' },
            }}
        >
            <HoverCard.Target>{children}</HoverCard.Target>
            <HoverCard.Dropdown
                bg="#0A0D12"
                maw={260}
                sx={(theme) => ({
                    boxShadow: theme.shadows.large,
                })}
            >
                <Stack spacing="sm" w="100%">
                    <Group spacing="xs">
                        <Text fw={600} size={14} c="white">
                            Canvas mode
                        </Text>
                        <Badge
                            variant="filled"
                            bg="indigo.0"
                            c="indigo.5"
                            radius={6}
                            size="md"
                            py="xxs"
                            px="xs"
                        >
                            Alpha
                        </Badge>
                    </Group>
                    <Text size="xs" c="white">
                        Define & view Metric relationships & hierarchies.
                    </Text>
                    {segmentedControlTooltipLabel}
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default SegmentedControlHoverCard;
