import { Group, Pagination, Text, type GroupProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { FC } from 'react';

type PaginateControlProps = GroupProps & {
    currentPage: number;
    totalPages: number;
    onPreviousPage: () => void;
    hasPreviousPage: boolean;
    onNextPage: () => void;
    hasNextPage: boolean;
};

const PaginateControl: FC<PaginateControlProps> = ({
    currentPage,
    totalPages,
    onPreviousPage,
    hasPreviousPage,
    onNextPage,
    hasNextPage,
    ...rest
}) => {
    return (
        <Group {...rest}>
            <Text color="ldGray.7" size="xs">
                Page{' '}
                <Text span fw={600}>
                    {currentPage}
                </Text>{' '}
                of{' '}
                <Text span fw={600}>
                    {totalPages}
                </Text>
            </Text>

            <Pagination.Root
                total={totalPages}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
            >
                <Group spacing="xs" position="center">
                    <Pagination.Previous
                        icon={IconChevronLeft}
                        disabled={!hasPreviousPage}
                    />
                    <Pagination.Next
                        icon={IconChevronRight}
                        disabled={!hasNextPage}
                    />
                </Group>
            </Pagination.Root>
        </Group>
    );
};

export default PaginateControl;
