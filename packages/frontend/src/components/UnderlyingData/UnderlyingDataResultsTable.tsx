import { NonIdealState } from '@blueprintjs/core';
import { ApiQueryResults, Field } from '@lightdash/common';
import React, { FC } from 'react';
import useSqlRunnerColumns from '../../hooks/useSqlRunnerColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import Table from '../common/Table';
import { TableContainer } from '../Explorer/ResultsCard/ResultsCard.styles';

const ResultsErrorState: FC<{ error: string }> = ({ error }) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState icon="error" description={error} />
        </div>
    </TrackSection>
);

const UnderlyingDataResultsTable: FC<{
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    hasJoins?: boolean;
}> = ({ fieldsMap, resultsData, hasJoins }) => {
    const columnHeader = (dimension: Field) => {
        return hasJoins === true ? (
            <span>
                {dimension.tableLabel} <b>{dimension.label}</b>
            </span>
        ) : (
            <span>
                <b>{dimension.label}</b>
            </span>
        );
    };
    const columns = useSqlRunnerColumns({
        resultsData,
        fieldsMap,
        columnHeader,
    });

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableContainer>
                <Table
                    status={'success'}
                    data={resultsData?.rows || []}
                    columns={columns}
                    pagination={{
                        show: true,
                    }}
                    footer={{
                        show: true,
                    }}
                />
            </TableContainer>
        </TrackSection>
    );
};

export default UnderlyingDataResultsTable;
