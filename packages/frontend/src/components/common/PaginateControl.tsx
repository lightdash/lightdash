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
            <Text color="gray.7" size="xs">
                Page{' '}
                <Text span fw={600} color="black">
                    {currentPage}
                </Text>{' '}
                of{' '}
                <Text span fw={600} color="black">
                    {totalPages}
                </Text>
            </Text>

            <Pagination.Root
                total={totalPages}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
            >
                <Group spacing="xs" position="center">
                    <Pagination.Previous icon={IconChevronLeft} />
                    <Pagination.Next icon={IconChevronRight} />
                </Group>
            </Pagination.Root>
        </Group>
    );
};

export default PaginateControl;
