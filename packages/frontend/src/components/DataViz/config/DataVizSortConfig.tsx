import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Select, Text, Tooltip, useMantineTheme } from '@mantine/core';
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

const getSortLabel = (label: SortByDirection | undefined) => {
    switch (label) {
        case SortByDirection.ASC:
            return 'Sort ascending';
        case SortByDirection.DESC:
            return 'Sort descending';
        default:
            return 'No sorting';
    }
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
        <Text>{getSortLabel(value)}</Text>
    </Box>
));

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
    const { colors } = useMantineTheme();
    const { classes, cx } = usePillSelectStyles({
        backgroundColor: colors.gray[2],
        textColor: colors.gray[7],
        hoverColor: colors.gray[3],
    });

    const selectOptions = [
        {
            value: 'none',
            label: 'No sorting',
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
        <Tooltip label="Sort by" variant="xs" withinPortal>
            <Select
                withinPortal
                data={selectOptions}
                itemComponent={SortItem}
                value={sortBy ?? selectOptions[0].value}
                onChange={(value: SortByDirection | 'none') =>
                    onChangeSortBy(value === 'none' ? undefined : value)
                }
                icon={sortBy ? <SortIcon sortByDirection={sortBy} /> : null}
                classNames={{
                    item: classes.item,
                    dropdown: classes.dropdown,
                    input: cx(
                        classes.input,
                        !sortBy && classes.inputUnsetValue,
                    ),
                    rightSection: classes.rightSection,
                }}
                styles={{
                    input: {
                        width: '105px',
                    },
                }}
            />
        </Tooltip>
    );
};
