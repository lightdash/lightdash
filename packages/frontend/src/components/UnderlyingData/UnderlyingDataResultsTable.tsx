import { NonIdealState, Spinner } from '@blueprintjs/core';
import { ApiQueryResults, Field } from '@lightdash/common';
import React, { FC } from 'react';
import useUnderlyingDataColumns from '../../hooks/useUnderlyingDataColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import Table from '../common/Table';
import { TableContainer } from '../Explorer/ResultsCard/ResultsCard.styles';
import { LoadingPanel } from './UnderlyingDataModal.styles';

const UnderlyingDataResultsTable: FC<{
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    hasJoins?: boolean;
}> = ({ fieldsMap, resultsData, isLoading, hasJoins }) => {
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
    const columns = useUnderlyingDataColumns({
        resultsData,
        fieldsMap,
        columnHeader,
    });

    if (isLoading) {
        return (
            <LoadingPanel>
                <NonIdealState
                    title="Loading underlying data"
                    icon={<Spinner />}
                />
            </LoadingPanel>
        );
    }

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableContainer>
                <Table
                    status={'success'}
                    data={resultsData?.rows || []}
                    columns={columns}
                    pagination={{
                        show: true,
                        defaultScroll: true,
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
