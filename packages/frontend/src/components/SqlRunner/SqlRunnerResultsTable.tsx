import { NonIdealState } from '@blueprintjs/core';
import { ApiQueryResults, CompiledDimension } from '@lightdash/common';
import React, { FC } from 'react';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import useSqlRunnerColumns from '../../hooks/useSqlRunnerColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import Table from '../common/Table';
import { TableContainer } from '../Explorer/ResultsCard/ResultsCard.styles';
import RunSqlQueryButton from './RunSqlQueryButton';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState icon="error" description={error} />
        </div>
    </TrackSection>
);

const ResultsIdleState: FC<React.ComponentProps<typeof RunSqlQueryButton>> = (
    props,
) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RunSqlQueryButton {...props} />}
            />
        </div>
    </TrackSection>
);

const SqlRunnerResultsTable: FC<{
    onSubmit: () => void;
    sqlQueryDimensions: Record<string, CompiledDimension>;
    resultsData: ApiQueryResults | undefined;
    sqlQueryMutation: ReturnType<typeof useSqlQueryMutation>;
}> = ({
    onSubmit,
    sqlQueryDimensions,
    resultsData,
    sqlQueryMutation: { status, error },
}) => {
    const columns = useSqlRunnerColumns({
        resultsData,
        fieldsMap: sqlQueryDimensions,
    });

    if (error) {
        return <ResultsErrorState error={error.error.message} />;
    }

    const IdleState = () => (
        <ResultsIdleState onSubmit={onSubmit} isLoading={false} />
    );

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableContainer>
                <Table
                    status={status}
                    data={resultsData?.rows || []}
                    columns={columns}
                    idleState={IdleState}
                    pagination={{
                        show: true,
                    }}
                />
            </TableContainer>
        </TrackSection>
    );
};

export default SqlRunnerResultsTable;
