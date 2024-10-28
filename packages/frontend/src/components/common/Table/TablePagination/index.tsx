import { SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import PaginateControl from '../../PaginateControl';
import { TableFooter } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../types';

interface ResultCountProps {
    count: number;
}

export const ResultCount: FC<ResultCountProps> = ({ count }) => (
    <Text style={{ marginLeft: 'auto' }} fz="xs">
        {count === 0 ? null : count === 1 ? '1 result' : `${count} results`}
    </Text>
);

const TablePagination: FC = () => {
    const { table, data, pagination } = useTableContext();

    return (
        <TableFooter>
            {pagination?.show && data.length > DEFAULT_PAGE_SIZE && (
                <SegmentedControl
                    data={[
                        { label: 'Pages', value: 'pages' },
                        { label: 'Scroll', value: 'scroll' },
                    ]}
                    value={
                        table.getState().pagination.pageSize ===
                        DEFAULT_PAGE_SIZE
                            ? 'pages'
                            : 'scroll'
                    }
                    onChange={(value) => {
                        table.setPageSize(
                            value === 'pages'
                                ? DEFAULT_PAGE_SIZE
                                : MAX_PAGE_SIZE,
                        );
                    }}
                />
            )}

            {table.getPageCount() > 1 ? (
                <PaginateControl
                    currentPage={table.getState().pagination.pageIndex + 1}
                    totalPages={table.getPageCount()}
                    onPreviousPage={table.previousPage}
                    onNextPage={table.nextPage}
                    hasPreviousPage={table.getCanPreviousPage()}
                    hasNextPage={table.getCanNextPage()}
                />
            ) : pagination?.showResultsTotal ? (
                <ResultCount
                    count={table.getPreGroupedRowModel().rows.length}
                />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
