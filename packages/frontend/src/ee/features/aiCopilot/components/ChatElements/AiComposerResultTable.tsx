import {
    getComposerRunQueryChart,
    toComposerResultRows,
    type ComposerRunQueryChart,
    type ComposerStoredChartVizConfig,
} from '@lightdash/common';
import { Box, Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { useMemo, type FC, type ReactNode } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { AiComposerResultError } from './AiComposerResultError';
import { AiComposerRunQueryChart } from './AiComposerRunQueryChart';
import { useArtifactResultRows } from './useArtifactResultRows';

const TABLE_VIZ_CONFIG: ComposerStoredChartVizConfig = {
    type: 'table',
    x: null,
    y: null,
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};
const TABLE_METADATA = { title: '', description: '' };

type Props = {
    projectUuid: string;
    results: InfiniteQueryResults;
    headerContent: ReactNode;
    loadingMessage: string;
};

// Any composer node result as a table, edge to edge, labelled and formatted like the final chart.
export const AiComposerResultTable: FC<Props> = ({
    projectUuid,
    results,
    headerContent,
    loadingMessage,
}) => {
    const uiStrings = useUiStrings();
    const { columns, isLoading } = useArtifactResultRows(results);
    const chart = useMemo((): ComposerRunQueryChart | Error | null => {
        if (columns.length === 0) return null;
        try {
            return getComposerRunQueryChart({
                columns,
                vizConfig: TABLE_VIZ_CONFIG,
                metadata: TABLE_METADATA,
                customChartTypeSlots: [],
            });
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [columns]);
    const readyChart = chart instanceof Error ? null : chart;
    const rows = useMemo(
        () =>
            readyChart ? toComposerResultRows(readyChart, results.rows) : [],
        [readyChart, results.rows],
    );

    if (isLoading || (columns.length > 0 && !results.hasFetchedAllRows)) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="ldGray.6"
                    delayedMessage={loadingMessage}
                />
            </Center>
        );
    }

    if (chart instanceof Error) {
        return (
            <AiComposerResultError
                headerContent={headerContent}
                message={chart.message}
            />
        );
    }

    if (!readyChart) {
        return (
            <Stack gap="md" h="100%" mih={0}>
                {headerContent}
                <Paper variant="dotted" p="xl" m="md">
                    <Text size="sm" c="dimmed" ta="center">
                        {uiStrings('aiAgent.composer.emptyResult')}
                    </Text>
                </Paper>
            </Stack>
        );
    }

    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Box flex={1} mih={0}>
                <AiComposerRunQueryChart
                    projectUuid={projectUuid}
                    chart={readyChart}
                    results={results}
                    rows={rows}
                    flush
                />
            </Box>
        </Stack>
    );
};
