import { Button, Group, SegmentedControl, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../MantineIcon';
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
                <Group>
                    <Text color="gray.7" size="xs">
                        Page{' '}
                        <Text span fw={600} color="black">
                            {table.getState().pagination.pageIndex + 1}
                        </Text>{' '}
                        of{' '}
                        <Text span fw={600} color="black">
                            {table.getPageCount()}
                        </Text>
                    </Text>

                    <Button.Group>
                        <Button
                            size="xs"
                            variant="outline"
                            color="gray.7"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <MantineIcon icon={IconChevronLeft} />
                        </Button>

                        <Button
                            size="xs"
                            variant="outline"
                            color="gray.7"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            <MantineIcon icon={IconChevronRight} />
                        </Button>
                    </Button.Group>
                </Group>
            ) : pagination?.showResultsTotal ? (
                <ResultCount count={table.getRowModel().rows.length} />
            ) : null}
        </TableFooter>
    );
};

export default TablePagination;
