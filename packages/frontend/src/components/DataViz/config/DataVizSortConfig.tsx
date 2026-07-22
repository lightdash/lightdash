import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Text, Select, Tooltip } from '@mantine-8/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './PillSelect.module.css';

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

    return icon ? <MantineIcon color="ldGray.6" icon={icon} /> : null;
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
        value: SortByDirection | 'none';
        selected: boolean;
    }
>(({ value, label, selected: _selected, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Text>{getSortLabel(value === 'none' ? undefined : value)}</Text>
    </Box>
));

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
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
        <Tooltip label="Sort by" withinPortal>
            <Select
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                data={selectOptions}
                renderOption={({ option, checked }) => (
                    <SortItem
                        value={option.value as SortByDirection | 'none'}
                        label={option.label}
                        selected={checked ?? false}
                    />
                )}
                value={sortBy ?? selectOptions[0].value}
                onChange={(value) =>
                    onChangeSortBy(
                        value === 'none'
                            ? undefined
                            : (value as SortByDirection),
                    )
                }
                leftSection={
                    sortBy ? <SortIcon sortByDirection={sortBy} /> : null
                }
                classNames={{
                    option: `${classes.option} ${classes.grayOption}`,
                    dropdown: classes.dropdown,
                    input: `${classes.input} ${classes.grayInput} ${
                        !sortBy ? classes.inputUnsetValue : ''
                    }`,
                    section: classes.section,
                }}
                styles={{
                    input: {
                        width: '115px',
                    },
                }}
            />
        </Tooltip>
    );
};
