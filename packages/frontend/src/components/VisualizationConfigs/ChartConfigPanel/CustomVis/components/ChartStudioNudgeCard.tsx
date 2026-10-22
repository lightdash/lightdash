import {
    Anchor,
    Button,
    CloseButton,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import { CHART_STUDIO_DOCS_URL } from '../../../../../features/chartTypes/utils/chartStudioDocs';
import MantineIcon from '../../../../common/MantineIcon';
import classes from './ChartStudioNudgeCard.module.css';

type Props = {
    onOpenChartStudio: () => void;
    onDismiss: () => void;
};

/** Dismissible suggestion at the top of the Vega editor to build the chart in Chart Studio instead. */
export const ChartStudioNudgeCard: FC<Props> = ({
    onOpenChartStudio,
    onDismiss,
}) => (
    <Paper p="md" className={classes.card} data-testid="chart-studio-nudge">
        <CloseButton
            size="sm"
            aria-label="Dismiss"
            className={classes.close}
            onClick={onDismiss}
        />
        <Stack gap="sm">
            <Group gap="sm" wrap="nowrap" align="flex-start">
                <span className={classes.icon}>
                    <MantineIcon icon={IconPuzzle} size={16} />
                </span>
                <Stack gap={4} pr="lg">
                    <Text fz="sm" fw={600}>
                        Try Chart Studio for custom charts
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Chart Studio charts are more customizable and reusable
                        than Vega-Lite. Build a chart type once, then use it
                        like a built-in chart on any query in the project.
                    </Text>
                </Stack>
            </Group>
            <Group gap="xs">
                <Button size="xs" onClick={onOpenChartStudio}>
                    Open Chart Studio
                </Button>
                <Button size="xs" variant="subtle" onClick={onDismiss}>
                    Continue with Vega
                </Button>
                <Anchor
                    fz="xs"
                    href={CHART_STUDIO_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                >
                    Chart Studio docs
                </Anchor>
            </Group>
        </Stack>
    </Paper>
);
