import { Button, ButtonGroup } from '@blueprintjs/core';
import { PageCount, PaginationWrapper, TableFooter } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../types';

const TablePagination = () => {
    const { table, data, pagination } = useTableContext();
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
            ) : (
                <PageCount>
                    <b>{table.getRowModel().rows.length} results</b>
                </PageCount>
            )}
        </TableFooter>
    );
};

export default TablePagination;
