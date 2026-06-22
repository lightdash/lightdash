import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Box, ColorSwatch, Group, Stack, Text } from '@mantine-8/core';
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
};

export const ReviewFindingsPreview: FC<Props> = ({
    items,
    totalOpen,
    reviewsUrl,
}) => (
    <Stack gap={2}>
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
