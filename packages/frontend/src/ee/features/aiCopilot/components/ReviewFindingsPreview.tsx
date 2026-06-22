import { type AiAgentReviewItemSummary } from '@lightdash/common';
import {
    Box,
    ColorSwatch,
    Group,
    Skeleton,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type EChartsOption } from 'echarts';
import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import EChartsReact from '../../../../components/EChartsReactWrapper';
import {
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './Admin/reviewItemDetails';
import classes from './ReviewFindingsPreview.module.css';

type Props = {
    items: AiAgentReviewItemSummary[];
    totalOpen: number;
    reviewsUrl: string;
    promptTrend: { date: string; promptCount: number }[];
    isLoadingPromptTrend?: boolean;
};

const formatPromptDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
};

const PromptSparkline: FC<{ data: { promptCount: number }[] }> = ({ data }) => {
    const option = useMemo<EChartsOption>(
        () => ({
            animation: false,
            grid: {
                left: 2,
                right: 2,
                top: 4,
                bottom: 4,
            },
            xAxis: {
                type: 'category',
                show: false,
                boundaryGap: false,
                data: data.map((_, index) => index),
            },
            yAxis: {
                type: 'value',
                show: false,
                min: 0,
                splitLine: { show: false },
            },
            series: [
                {
                    type: 'line',
                    data: data.map((point) => point.promptCount),
                    smooth: true,
                    silent: true,
                    symbol: 'none',
                    lineStyle: {
                        width: 2,
                        color: 'var(--mantine-color-violet-5)',
                    },
                    areaStyle: {
                        opacity: 0.08,
                        color: 'var(--mantine-color-violet-5)',
                    },
                },
            ],
            tooltip: { show: false },
        }),
        [data],
    );

    return (
        <EChartsReact
            className={classes.sparkline}
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            style={{ height: 42, width: '100%' }}
        />
    );
};

export const ReviewFindingsPreview: FC<Props> = ({
    items,
    totalOpen,
    reviewsUrl,
    promptTrend,
    isLoadingPromptTrend = false,
}) => {
    const totalPrompts = promptTrend.reduce(
        (total, point) => total + point.promptCount,
        0,
    );
    const firstPromptTrendLabel = promptTrend[0]
        ? formatPromptDate(promptTrend[0].date)
        : null;
    const lastPromptTrendLabel = promptTrend[promptTrend.length - 1]
        ? formatPromptDate(promptTrend[promptTrend.length - 1].date)
        : null;

    return (
        <Stack gap={2}>
            <Box px="xs" pt={4} pb={6}>
                <Group justify="space-between" mb={4} wrap="nowrap">
                    <Text className={classes.heading}>Prompts</Text>
                    <Text className={classes.heading}>
                        {totalPrompts} in 14d
                    </Text>
                </Group>
                {isLoadingPromptTrend ? (
                    <Skeleton height={42} radius="sm" />
                ) : (
                    <PromptSparkline data={promptTrend} />
                )}
                <Group justify="space-between" mt={2} wrap="nowrap">
                    <Text className={classes.axisLabel}>
                        {firstPromptTrendLabel}
                    </Text>
                    <Text className={classes.axisLabel}>
                        {lastPromptTrendLabel}
                    </Text>
                </Group>
            </Box>

            <Group justify="space-between" px="xs" pt={4} pb={2} wrap="nowrap">
                <Text className={classes.heading}>Review findings</Text>
                <Text className={classes.heading}>{totalOpen} open</Text>
            </Group>

            {items.map((item) => (
                <Box
                    key={item.fingerprint}
                    component={Link}
                    to={`/generalSettings/ai/reviews/${encodeURIComponent(
                        item.fingerprint,
                    )}`}
                    className={classes.row}
                >
                    <ColorSwatch
                        size={8}
                        withShadow={false}
                        color={`var(--mantine-color-${
                            reviewRootCauseColors[item.primaryRootCause]
                        }-5)`}
                    />
                    <Text className={classes.title} truncate="end">
                        {item.title}
                    </Text>
                    <Text className={classes.tag}>
                        {reviewRootCauseLabels[item.primaryRootCause]}
                    </Text>
                </Box>
            ))}

            <Box component={Link} to={reviewsUrl} className={classes.footer}>
                <Text size="xs" fw={500}>
                    View all reviews
                </Text>
                <MantineIcon icon={IconArrowRight} size={12} />
            </Box>
        </Stack>
    );
};
