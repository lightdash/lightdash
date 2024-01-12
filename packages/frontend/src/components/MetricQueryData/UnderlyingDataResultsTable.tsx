import { ApiQueryResults, Field } from '@lightdash/common';
import { Box, Center } from '@mantine/core';
import { FC, useCallback } from 'react';
import useUnderlyingDataColumns from '../../hooks/useUnderlyingDataColumns';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../common/Table/Table.styles';
import { TableColumn } from '../common/Table/types';
import CellContextMenu from './CellContextMenu';

const UnderlyingDataResultsTable: FC<{
    fieldsMap: Record<string, Field>;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    hasJoins?: boolean;
    sortByUnderlyingValues: (
        columnA: TableColumn,
        columnB: TableColumn,
    ) => number;
}> = ({
    fieldsMap,
    resultsData,
    isLoading,
    hasJoins,
    sortByUnderlyingValues,
}) => {
    const columnHeader = useCallback(
        (dimension: Field) => (
            <TableHeaderLabelContainer>
                {hasJoins === true && (
                    <TableHeaderRegularLabel>
                        {dimension.tableLabel}{' '}
                    </TableHeaderRegularLabel>
                )}

                <TableHeaderBoldLabel>{dimension.label}</TableHeaderBoldLabel>
            </TableHeaderLabelContainer>
        ),
        [hasJoins],
    );

    const columns = useUnderlyingDataColumns({
        resultsData,
        fieldsMap,
        columnHeader,
    });

    if (isLoading) {
        return (
            <Center my="lg" miw="70vw">
                <SuboptimalState title="Loading underlying data" loading />
            </Center>
        );
    }

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box h="inherit">
                <Table
                    status={'success'}
                    data={resultsData?.rows || []}
                    columns={columns.sort(sortByUnderlyingValues)}
                    pagination={{
                        show: true,
                        defaultScroll: true,
                    }}
                    footer={{
                        show: true,
                    }}
                    cellContextMenu={CellContextMenu}
                    $shouldExpand
                />
            </Box>
        </TrackSection>
    );
};

export default UnderlyingDataResultsTable;
