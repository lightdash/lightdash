import { PivotData } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import PivotTable from '../../components/common/PivotTable';
import { pivotQueryResults } from '../../hooks/pivotTable/pivotQueryResults';
import {
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from '../../hooks/pivotTable/pivotQueryResults.mock';

const result1: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: false,
    },
    metricQuery: METRIC_QUERY_2DIM_2METRIC,
    rows: RESULT_ROWS_2DIM_2METRIC,
});

const result2: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: true,
    },
    metricQuery: METRIC_QUERY_2DIM_2METRIC,
    rows: RESULT_ROWS_2DIM_2METRIC,
});

const result3: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: ['site', 'page'],
        metricsAsRows: true,
    },
    metricQuery: METRIC_QUERY_2DIM_2METRIC,
    rows: RESULT_ROWS_2DIM_2METRIC,
});

const result4: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: [],
        metricsAsRows: false,
    },
    metricQuery: METRIC_QUERY_2DIM_2METRIC,
    rows: RESULT_ROWS_2DIM_2METRIC,
});

const PivotingPOC = () => {
    return (
        <Stack spacing="lg" p="xl">
            <Stack spacing="sm">
                <Title order={3}>Pivot 1</Title>
                <PivotTable data={result1} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 2 (metrics as rows)</Title>
                <PivotTable data={result2} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 3 (only metric rows)</Title>
                <PivotTable data={result3} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 4 (only metric cols)</Title>
                <PivotTable data={result4} />
            </Stack>
        </Stack>
    );
};

export default PivotingPOC;
