import { Group, Pagination, Text, type GroupProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('table');
    return (
        <Group {...rest}>
            <Text c="ldGray.7" size="xs">
                <Trans
                    t={t}
                    i18nKey="paginateControl.pageOf"
                    values={{ currentPage, totalPages }}
                    components={{ strong: <Text span fw={600} /> }}
                />
            </Text>

            <Pagination.Root
                total={totalPages}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
            >
                <Group gap="xs" justify="center">
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
