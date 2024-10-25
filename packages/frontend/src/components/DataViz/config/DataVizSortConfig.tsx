import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const SortIcon: FC<{ sortByDirection: VizSortBy['direction'] }> = ({
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

    return icon ? <MantineIcon color="gray.6" icon={icon} /> : null;
};

type Props = {
    sortBy: VizSortBy['direction'] | undefined;
    onChangeSortBy: (value: VizSortBy['direction'] | undefined) => void;
};

const SortItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        label: string;
        value: SortByDirection | undefined;
        selected: boolean;
    }
>(({ value, label, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap spacing="xs">
            {value && <SortIcon sortByDirection={value} />}
            <Text>{label}</Text>
        </Group>
    </Box>
));

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
    console.log({ sortBy });

    const selectOptions = [
        {
            value: 'none',
            label: 'No sort',
        },
        {
            value: SortByDirection.ASC,
            label: 'Ascending',
        },
        {
            value: SortByDirection.DESC,
            label: 'Descending',
        },
    ];

    return (
        <Select
            withinPortal
            fz="13px"
            data={selectOptions}
            itemComponent={SortItem}
            value={sortBy ?? selectOptions[0].value}
            onChange={(value: SortByDirection | 'none') =>
                onChangeSortBy(value === 'none' ? undefined : value)
            }
            icon={
                sortBy ? (
                    <MantineIcon
                        color="gray.6"
                        icon={
                            sortBy === SortByDirection.ASC
                                ? IconArrowRight
                                : IconArrowLeft
                        }
                    />
                ) : null
            }
            styles={(theme) => ({
                input: {
                    width: sortBy ? '110px' : '50px',
                    height: '24px',
                    minHeight: '24px',
                    padding: 0,
                    textAlign: 'right',
                    backgroundColor: theme.fn.lighten(
                        theme.colors.gray[2],
                        0.5,
                    ),
                    paddingLeft: '4px',
                    color: theme.colors.gray[7],
                    fontWeight: 500,
                    border: 'none',
                    borderRadius: theme.radius.sm,
                    '&[data-with-icon]': {
                        padding: theme.spacing.sm,
                    },
                    fontSize: '13px',
                    '&:hover': {
                        backgroundColor: theme.fn.lighten(
                            theme.colors.gray[2],
                            0.1,
                        ),
                    },
                },

                rightSection: {
                    display: 'none',
                },
                dropdown: {
                    minWidth: 'fit-content',
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.gray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.gray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.gray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
            })}
        />
    );
};
