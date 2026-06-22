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
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './Admin/reviewItemDetails';
import classes from './ReviewFindingsPreview.module.css';

type Props = {
    items: AiAgentReviewItemSummary[];
    totalOpen: number;
    reviewsUrl: string;
    promptTrend: { label: string; prompts: number }[];
    isLoadingPromptTrend?: boolean;
};

const PromptSparkline: FC<{ data: { prompts: number }[] }> = ({ data }) => {
    const width = 244;
    const height = 42;
    const padding = 3;
    const max = Math.max(1, ...data.map((point) => point.prompts));
    const lastIndex = Math.max(1, data.length - 1);
    const points = data
        .map((point, index) => {
            const x = padding + (index / lastIndex) * (width - padding * 2);
            const y =
                height -
                padding -
                (point.prompts / max) * (height - padding * 2);

            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg
            className={classes.sparkline}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Prompts over time"
        >
            <polyline points={points} />
        </svg>
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
        (total, point) => total + point.prompts,
        0,
    );
    const firstPromptTrendLabel = promptTrend[0]?.label;
    const lastPromptTrendLabel = promptTrend[promptTrend.length - 1]?.label;

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
