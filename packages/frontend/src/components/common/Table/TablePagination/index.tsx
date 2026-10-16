import { Text, SegmentedControl } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import PaginateControl from '../../PaginateControl';
import { DEFAULT_PAGE_SIZE } from '../constants';
import { TableFooter } from '../Table.styles';
import { useTableContext } from '../useTableContext';

interface ResultCountProps {
    count: number;
}

export const ResultCount: FC<ResultCountProps> = ({ count }) => {
    const { t } = useTranslation('table');
    return (
        <Text ml="auto" fz="xs">
            {count === 0 ? null : t('pagination.resultCount', { count })}
        </Text>
    );
};

const TablePagination: FC = () => {
    const {
        table,
        data,
        pagination,
        totalRowsCount,
        isInfiniteScrollEnabled,
        setIsInfiniteScrollEnabled,
    } = useTableContext();
    const { t } = useTranslation('table');

    return (
        <TableFooter>
            {pagination?.show && data.length > DEFAULT_PAGE_SIZE && (
                <SegmentedControl
                    data={[
                        { label: t('pagination.pages'), value: 'pages' },
                        { label: t('pagination.scroll'), value: 'scroll' },
                    ]}
                    value={isInfiniteScrollEnabled ? 'scroll' : 'pages'}
                    onChange={(value) => {
                        setIsInfiniteScrollEnabled(value === 'scroll');
                    }}
                />
            )}

            {!isInfiniteScrollEnabled && table.getPageCount() > 1 ? (
                <PaginateControl
                    currentPage={table.getState().pagination.pageIndex + 1}
                    totalPages={table.getPageCount()}
                    onPreviousPage={table.previousPage}
                    onNextPage={table.nextPage}
                    hasPreviousPage={table.getCanPreviousPage()}
                    hasNextPage={table.getCanNextPage()}
                />
            ) : pagination?.showResultsTotal ? (
                <ResultCount count={totalRowsCount} />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
