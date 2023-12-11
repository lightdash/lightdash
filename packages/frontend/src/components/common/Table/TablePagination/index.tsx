import { Button, ButtonGroup } from '@blueprintjs/core';
import { FC } from 'react';
import { PageCount, PaginationWrapper, TableFooter } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../types';

interface ResultCountProps {
    count: number;
}

export const ResultCount: FC<ResultCountProps> = ({ count }) => (
    <PageCount>
        {count === 0 ? null : count === 1 ? '1 result' : `${count} results`}
    </PageCount>
);

const TablePagination = () => {
    const table = useTableContext((context) => context.table);
    const data = useTableContext((context) => context.data);
    const pagination = useTableContext((context) => context.pagination);

    return (
        <TableFooter>
            <ButtonGroup>
                {pagination?.show && data.length > DEFAULT_PAGE_SIZE && (
                    <>
                        <Button
                            active={
                                table.getState().pagination.pageSize !==
                                DEFAULT_PAGE_SIZE
                            }
                            text="Scroll"
                            onClick={() => table.setPageSize(MAX_PAGE_SIZE)}
                        />
                        <Button
                            active={
                                table.getState().pagination.pageSize ===
                                DEFAULT_PAGE_SIZE
                            }
                            text="Pages"
                            onClick={() => table.setPageSize(DEFAULT_PAGE_SIZE)}
                        />
                    </>
                )}
            </ButtonGroup>
            {table.getPageCount() > 1 ? (
                <PaginationWrapper>
                    <PageCount>
                        Page <b>{table.getState().pagination.pageIndex + 1}</b>{' '}
                        of <b>{table.getPageCount()}</b>
                    </PageCount>
                    <Button
                        style={{ marginLeft: 20 }}
                        icon="arrow-left"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    />
                    <Button
                        style={{ marginLeft: 10 }}
                        icon="arrow-right"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    />
                </PaginationWrapper>
            ) : pagination?.showResultsTotal ? (
                <ResultCount count={table.getRowModel().rows.length} />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
