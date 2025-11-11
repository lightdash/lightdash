import { Box, MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import {
    selectSavedChart,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { useExplorerQuery } from '../../../../../hooks/useExplorerQuery';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import MinimalSavedExplorer from '../../../../../pages/MinimalSavedExplorer';
import useApp from '../../../../../providers/App/useApp';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const MinimalChartContent = memo(() => {
    const { health } = useApp();

    // Get query state from hook
    const { query, queryResults } = useExplorerQuery();

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
        }),
        [queryResults, query.data],
    );

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);

    const isLoadingQueryResults =
        query.isFetching || queryResults.isFetchingRows;

    if (!savedChart || health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartConfig={savedChart.chartConfig}
            initialPivotDimensions={savedChart.pivotConfig?.columns}
            resultsData={resultsData}
            isLoading={isLoadingQueryResults}
            columnOrder={savedChart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={savedChart.uuid}
            colorPalette={savedChart.colorPalette}
            parameters={query.data?.usedParametersValues}
        >
            <MantineProvider inherit theme={themeOverride}>
                <Box mih="inherit" h="100%">
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                    />
                </Box>
            </MantineProvider>
        </VisualizationProvider>
    );
});

MinimalChartContent.displayName = 'MinimalChartContent';

type Props = {
    containerStyles?: React.CSSProperties;
    savedQueryUuid: string;
};

const EmbedChart: FC<Props> = ({ containerStyles, savedQueryUuid }) => {
    const { data, isInitialLoading, isError, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    if (isInitialLoading) {
        return null;
    }

    if (isError) {
        return (
            <Box mt={20}>
                <SuboptimalState
                    title="Error loading chart"
                    icon={IconUnlink}
                    description={
                        error.error.message.includes('jwt expired')
                            ? 'This embed link has expired'
                            : error.error.message
                    }
                />
            </Box>
        );
    }

    if (!data) {
        return (
            <Box mt={20}>
                <SuboptimalState title="Chart not found" icon={IconUnlink} />
            </Box>
        );
    }

    return (
        <div style={containerStyles}>
            <MinimalSavedExplorer savedQueryUuid={savedQueryUuid} />
        </div>
    );
};

export default EmbedChart;
