import { Button, Group, Text, type GroupProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from './MantineIcon';

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

            <Button.Group>
                <Button
                    size="xs"
                    variant="outline"
                    color="gray.7"
                    onClick={onPreviousPage}
                    disabled={!hasPreviousPage}
                >
                    <MantineIcon icon={IconChevronLeft} />
                </Button>

                <Button
                    size="xs"
                    variant="outline"
                    color="gray.7"
                    onClick={onNextPage}
                    disabled={!hasNextPage}
                >
                    <MantineIcon icon={IconChevronRight} />
                </Button>
            </Button.Group>
        </Group>
    );
};

export default PaginateControl;
