import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const SortIcon: FC<{ sortByDirection: SortByDirection }> = ({
    sortByDirection,
}) => {
    let icon;
    switch (sortByDirection) {
        case SortByDirection.ASC:
            icon = IconArrowRight;
            break;
        case SortByDirection.DESC:
            icon = IconArrowLeft;
            break;
    }

    return <MantineIcon color="gray.6" icon={icon} />;
};

type Props = {
    sortBy: VizSortBy['direction'] | undefined;
    onChangeSortBy: (value: VizSortBy['direction']) => void;
};

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
    const currentSortDirection = sortBy || SortByDirection.ASC;
    const isAscending = currentSortDirection === SortByDirection.ASC;

    const toggleSort = () => {
        const newDirection = isAscending
            ? SortByDirection.DESC
            : SortByDirection.ASC;
        onChangeSortBy(newDirection);
    };

    return (
        <>
            <Button
                onClick={toggleSort}
                rightIcon={
                    isAscending ? (
                        <SortIcon sortByDirection={SortByDirection.ASC} />
                    ) : null
                }
                leftIcon={
                    !isAscending ? (
                        <SortIcon sortByDirection={SortByDirection.DESC} />
                    ) : null
                }
                w="100%"
                h="20px"
                mih="20px"
                px="xxs"
                radius="md"
                color="gray.0"
                c="gray.6"
                fw={500}
                fz={13}
                sx={(theme) => ({
                    borderRadius: theme.radius.sm,
                })}
            >
                {isAscending ? 'Ascending' : 'Descending'}
            </Button>
        </>
    );
};
