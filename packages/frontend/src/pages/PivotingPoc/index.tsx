import { PivotData } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { pivotQueryResults } from '../../hooks/pivotTable/pivotQueryResults';
import {
    METRIC_QUERY,
    RESULT_ROWS,
} from '../../hooks/pivotTable/pivotQueryResults.mock';
import PivotTable from './PivotTable';
// import { pivot1 } from './dummyData/pivot1';
// import { pivot2 } from './dummyData/pivot2';
// import { pivot3 } from './dummyData/pivot3';

const result1: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: false,
    },
    metricQuery: METRIC_QUERY,
    rows: RESULT_ROWS,
});

const result2: PivotData = pivotQueryResults({
    pivotConfig: {
        pivotDimensions: ['site'],
        metricsAsRows: true,
    },
    metricQuery: METRIC_QUERY,
    rows: RESULT_ROWS,
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

            {/* OLD examples */}
            {/* <Stack spacing="sm">
                <Title order={3}>Pivot 1</Title>
                <RenderTable data={pivot1} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 2</Title>
                <RenderTable data={pivot2} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Pivot 3 (metrics as rows)</Title>
                <RenderTable data={pivot3} />
            </Stack> */}
        </Stack>
    );
};

export default PivotingPOC;
