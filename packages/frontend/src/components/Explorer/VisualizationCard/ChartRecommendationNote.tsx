import { type ChartRecommendation } from '@lightdash/common';
import { Anchor, Group, Text, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './VisualizationCard.module.css';

type Props = {
    recommendation: ChartRecommendation;
    onChangeChartType: () => void;
};

/** Why Visualize drew this chart, with the way to pick another one. */
const ChartRecommendationNote: FC<Props> = ({
    recommendation,
    onChangeChartType,
}) => (
    <Group gap={6} wrap="nowrap" miw={0} data-testid="chart-recommendation">
        <MantineIcon icon={IconSparkles} size={14} color="dimmed" />
        {recommendation.topN && (
            <Text fz="xs" fw={600} className={classes.noWrap}>
                Top {recommendation.topN.count} of {recommendation.topN.total}
            </Text>
        )}
        <Tooltip label={recommendation.reason} multiline maw={360} withinPortal>
            <Text fz="xs" c="dimmed" truncate="end" miw={0}>
                {recommendation.reason}
            </Text>
        </Tooltip>
        <Anchor
            component="button"
            type="button"
            fz="xs"
            className={classes.noWrap}
            onClick={onChangeChartType}
        >
            Change chart type
        </Anchor>
    </Group>
);

export default ChartRecommendationNote;
