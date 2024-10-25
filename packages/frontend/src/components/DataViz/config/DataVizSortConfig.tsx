import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Group, Select, Text, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { usePillSelectStyles } from '../hooks/usePillSelectStyles';

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
    const { colors } = useMantineTheme();
    const { classes } = usePillSelectStyles({
        backgroundColor: colors.gray[2],
        textColor: colors.gray[7],
        hoverColor: colors.gray[3],
    });

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
            classNames={{
                item: classes.item,
                dropdown: classes.dropdown,
                input: classes.input,
                rightSection: classes.rightSection,
            }}
            styles={{
                input: {
                    width: sortBy ? '110px' : '60px',
                },
            }}
        />
    );
};
