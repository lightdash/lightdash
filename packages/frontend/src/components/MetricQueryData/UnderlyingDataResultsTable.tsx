import {
    type ApiQueryResults,
    type Field,
    type ItemsMap,
    type SortField,
} from '@lightdash/common';
import { Box, Center } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import useUnderlyingDataColumns from '../../hooks/useUnderlyingDataColumns';
import { TrackSection } from '../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../types/Events';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../common/Table/Table.styles';
import { type HeaderProps } from '../common/Table/types';
import CellContextMenu from './CellContextMenu';
import UnderlyingDataHeaderContextMenu from './UnderlyingDataHeaderContextMenu';

const UnderlyingDataResultsTable: FC<{
    fieldsMap: ItemsMap;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    hasJoins?: boolean;
    columnOrder: string[];
    sorts: SortField[];
    onSortChange: (sorts: SortField[]) => void;
}> = ({
    fieldsMap,
    resultsData,
    isLoading,
    hasJoins,
    columnOrder,
    sorts,
    onSortChange,
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

    const sortedColumns = useMemo(
        () =>
            [...columns].sort(
                (a, b) =>
                    columnOrder.indexOf(a.id ?? '') -
                    columnOrder.indexOf(b.id ?? ''),
            ),
        [columns, columnOrder],
    );

    const headerContextMenu = useCallback<
        FC<React.PropsWithChildren<HeaderProps>>
    >(
        (props) => (
            <UnderlyingDataHeaderContextMenu
                {...props}
                sorts={sorts}
                onSortChange={onSortChange}
            />
        ),
        [sorts, onSortChange],
    );

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
                    totalRowsCount={resultsData?.rows.length || 0}
                    isFetchingRows={false}
                    fetchMoreRows={() => undefined}
                    columns={sortedColumns}
                    pagination={{
                        show: true,
                        defaultScroll: true,
                    }}
                    footer={{
                        show: true,
                    }}
                    cellContextMenu={CellContextMenu}
                    headerContextMenu={headerContextMenu}
                    $shouldExpand
                />
            </Box>
        </TrackSection>
    );
};

export default UnderlyingDataResultsTable;
