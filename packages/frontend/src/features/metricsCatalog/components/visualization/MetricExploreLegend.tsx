import {
    MetricExplorerComparison,
    type MetricExplorerQuery,
} from '@lightdash/common';
import { ActionIcon, Flex, Group, Text, Tooltip } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { type LegendProps } from 'recharts';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SquareBadge } from './MetricExploreTooltip';
import { COMPARISON_OPACITY } from './types';

interface MetricExploreLegendProps extends Pick<LegendProps, 'payload'> {
    legendConfig: Record<
        string | 'metric' | 'compareMetric',
        { name: string; label: string }
    > | null;
    comparison: MetricExplorerQuery;
    getLegendProps: (value: string) => {
        opacity: number;
    };
    onMouseEnter?: (value: string) => void;
    onMouseLeave?: (value: string) => void;
    onClick?: (value: string) => void;
}

const LegendIcon = ({
    color,
    opacity,
}: {
    color: string | undefined;
    opacity: number;
}) => {
    return <SquareBadge color={color} size={12} opacity={opacity} />;
};

export const MetricExploreLegend: FC<MetricExploreLegendProps> = ({
    ...props
}) => {
    const [activePage, setActivePage] = useState(1);
    const { ref: containerRef, width: containerWidth } = useElementSize();

    // Constants for layout calculations
    const ITEM_PADDING = 24; // Additional space for color box and padding
    const ROWS = 2; // Maximum number of rows
    const ITEM_SPACING = 8; // Spacing between items
    const NAVIGATION_WIDTH = 30; // Width for navigation buttons
    const TWO_ROWS_HEIGHT = 56; // Approximately 2 rows (24px per row + spacing)

    const getItemWidth = useCallback(
        (text: string) =>
            // Each character is roughly 8px wide for font-size 14px
            text.length * 8 + ITEM_PADDING,
        [ITEM_PADDING],
    );

    const getLegendItemText = useCallback(
        (value: unknown): string =>
            props.legendConfig &&
            typeof value === 'string' &&
            value in props.legendConfig
                ? props.legendConfig[value]?.label || value
                : String(value),
        [props.legendConfig],
    );

    // Calculate how many items can fit in a row
    const calculateItemsPerRow = useCallback(
        (items: LegendProps['payload']) => {
            let currentWidth = 0;
            let itemCount = 0;
            const availableWidth = containerWidth - NAVIGATION_WIDTH;

            for (const item of items ?? []) {
                const itemText = getLegendItemText(item.value);
                const itemWidth = getItemWidth(itemText);

                if (currentWidth + itemWidth + ITEM_SPACING <= availableWidth) {
                    currentWidth += itemWidth + ITEM_SPACING;
                    itemCount++;
                } else {
                    break;
                }
            }

            return Math.max(1, itemCount); // Ensure at least 1 item per row
        },
        [containerWidth, getItemWidth, getLegendItemText],
    );

    // ! When type of legend is none, don't render it
    const legendItems = useMemo(() => {
        return props.payload?.filter((payload) => {
            return payload.type !== 'none';
        });
    }, [props.payload]);

    const itemsPerRow = calculateItemsPerRow(legendItems || []);
    const itemsPerPage = itemsPerRow * ROWS;

    const totalPages = Math.ceil((legendItems?.length ?? 0) / itemsPerPage);
    const requiresPagination = totalPages > 1;

    const visibleItems = useMemo(() => {
        return legendItems?.slice(
            (activePage - 1) * itemsPerPage,
            activePage * itemsPerPage,
        );
    }, [activePage, itemsPerPage, legendItems]);

    useEffect(
        function resetPagination() {
            setActivePage(1);
        },
        [props.legendConfig],
    );

    const getOpacity = useCallback(
        (value: string) => {
            return value === 'compareMetric' &&
                props.comparison.comparison ===
                    MetricExplorerComparison.PREVIOUS_PERIOD
                ? COMPARISON_OPACITY
                : 1;
        },
        [props.comparison],
    );

    return (
        <Flex
            w="100%"
            ref={containerRef}
            sx={{
                gap: 2,
                flexWrap: 'nowrap',
                justifyContent: requiresPagination ? 'center' : 'space-between',
            }}
        >
            <ActionIcon
                onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
                disabled={activePage === 1}
                variant="subtle"
                size="sm"
                display={requiresPagination ? 'flex' : 'none'}
            >
                <MantineIcon
                    icon={IconChevronLeft}
                    size={12}
                    color="ldDark.4"
                    strokeWidth={1.8}
                />
            </ActionIcon>

            <Group
                spacing="xs"
                position="center"
                noWrap
                w="100%"
                align="center"
                sx={{
                    rowGap: 4,
                    flex: 1,
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    maxHeight: TWO_ROWS_HEIGHT,
                }}
            >
                {visibleItems?.map((item) => (
                    <Group key={item.value} spacing={4} noWrap>
                        <LegendIcon
                            color={item.color}
                            opacity={getOpacity(item.value)}
                        />
                        <Tooltip
                            disabled={
                                props.comparison.comparison ===
                                MetricExplorerComparison.PREVIOUS_PERIOD
                            }
                            label={
                                props.legendConfig?.[item.value]?.label ??
                                item.value
                            }
                        >
                            <Text
                                span
                                c="ldGray.9"
                                fz={14}
                                fw={500}
                                maw={200}
                                truncate
                                {...props.getLegendProps(item.value)}
                                onMouseEnter={() =>
                                    props.onMouseEnter?.(item.value)
                                }
                                onMouseLeave={() =>
                                    props.onMouseLeave?.(item.value)
                                }
                                onClick={() => props.onClick?.(item.value)}
                            >
                                {getLegendItemText(item.value)}
                            </Text>
                        </Tooltip>
                    </Group>
                ))}
            </Group>

            <ActionIcon
                onClick={() =>
                    setActivePage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={activePage === totalPages}
                variant="subtle"
                size="sm"
                display={requiresPagination ? 'flex' : 'none'}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    size={12}
                    color="ldDark.4"
                    strokeWidth={1.8}
                />
            </ActionIcon>
        </Flex>
    );
};
