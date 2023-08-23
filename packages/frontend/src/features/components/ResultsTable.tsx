import { NonIdealState } from '@blueprintjs/core';
import { ApiError, ApiQueryResults, Field } from '@lightdash/common';
import { Box } from '@mantine/core';
import React, { FC } from 'react';
import { useQuery } from 'react-query';
import Table from '../../components/common/Table';
import useSqlRunnerColumns from '../../hooks/useSqlRunnerColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState icon="error" description={error} />
        </div>
    </TrackSection>
);

const MetricFlowResultsTable: FC<{
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    status: ReturnType<typeof useQuery>['status'];
    error: ReturnType<typeof useQuery<any, ApiError>>['error'];
}> = ({ fieldsMap, resultsData, status, error }) => {
    const columns = useSqlRunnerColumns({
        resultsData,
        fieldsMap,
    });

    if (error) {
        return <ResultsErrorState error={error.error.message} />;
    }

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" pt="sm">
                <Table
                    status={status}
                    data={resultsData?.rows || []}
                    columns={columns}
                    pagination={{
                        show: true,
                    }}
                    footer={{
                        show: true,
                    }}
                />
            </Box>
        </TrackSection>
    );
};

export default MetricFlowResultsTable;
