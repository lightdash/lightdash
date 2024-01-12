import { ApiQueryResults, Field } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import useSqlRunnerColumns from '../../hooks/useSqlRunnerColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import RunSqlQueryButton from './RunSqlQueryButton';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <SuboptimalState icon={IconAlertCircle} description={error} />
        </div>
    </TrackSection>
);

const ResultsIdleState: FC<React.ComponentProps<typeof RunSqlQueryButton>> = (
    props,
) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <SuboptimalState
                description="Click run query to see your results"
                action={<RunSqlQueryButton {...props} />}
            />
        </div>
    </TrackSection>
);

const SqlRunnerResultsTable: FC<{
    onSubmit: () => void;
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    sqlQueryMutation: ReturnType<typeof useSqlQueryMutation>;
}> = ({
    onSubmit,
    fieldsMap,
    resultsData,
    sqlQueryMutation: { status, error },
}) => {
    const columns = useSqlRunnerColumns({
        resultsData,
        fieldsMap,
    });

    if (error) {
        return <ResultsErrorState error={error.error.message} />;
    }

    const IdleState = () => (
        <ResultsIdleState onSubmit={onSubmit} isLoading={false} />
    );

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box px="xs" pt="sm">
                <Table
                    status={status}
                    data={resultsData?.rows || []}
                    columns={columns}
                    idleState={IdleState}
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

export default SqlRunnerResultsTable;
