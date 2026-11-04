import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import { CHART_STUDIO_DOCS_URL } from '../../../../../features/chartTypes/utils/chartStudioDocs';
import Callout from '../../../../common/Callout';
import MantineIcon from '../../../../common/MantineIcon';

type Props = {
    onOpenChartStudio: () => void;
    onDismiss: () => void;
};

/** Dismissible suggestion at the top of the Vega editor to build the chart in Chart Studio instead. */
export const ChartStudioNudgeCard: FC<Props> = ({
    onOpenChartStudio,
    onDismiss,
}) => (
    <Callout
        variant="info"
        icon={<MantineIcon icon={IconPuzzle} />}
        title="Try Chart Studio for custom charts"
        withCloseButton
        closeButtonLabel="Dismiss"
        onClose={onDismiss}
        data-testid="chart-studio-nudge"
    >
        <Stack gap="sm">
            <Text fz="xs">
                Chart Studio charts are more customizable and reusable than
                Vega-Lite. Build a chart type once, then use it like a built-in
                chart on any query in the project.{' '}
                <Anchor
                    inherit
                    href={CHART_STUDIO_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                >
                    Read the docs on Chart Studio here
                </Anchor>
                .
            </Text>
            <Group gap="xs" justify="flex-end">
                <Button size="xs" onClick={onOpenChartStudio}>
                    Open Chart Studio
                </Button>
            </Group>
        </Stack>
    </Callout>
);
