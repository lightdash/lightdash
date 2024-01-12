import { ApiError, ApiQueryResults } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React, { FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import Table from '../../../components/common/Table';
import { TableColumn } from '../../../components/common/Table/types';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <SuboptimalState icon={IconAlertCircle} description={error} />
        </div>
    </TrackSection>
);

const MetricFlowResultsTable: FC<{
    columns: TableColumn[];
    resultsData: Pick<ApiQueryResults, 'rows'> | undefined;
    status: ReturnType<typeof useQuery>['status'];
    error: ReturnType<typeof useQuery<any, ApiError>>['error'];
}> = ({ columns, resultsData, status, error }) => {
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
                        show: false,
                    }}
                />
            </Box>
        </TrackSection>
    );
};

export default MetricFlowResultsTable;
