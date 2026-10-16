import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Text, Select, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

    return icon ? <MantineIcon color="dimmed" icon={icon} /> : null;
};

type Props = {
    sortBy: VizSortBy['direction'] | undefined;
    onChangeSortBy: (value: VizSortBy['direction'] | undefined) => void;
};

const getSortLabel = (t: TFunction, label: SortByDirection | undefined) => {
    switch (label) {
        case SortByDirection.ASC:
            return t('sort.sortAscending');
        case SortByDirection.DESC:
            return t('sort.sortDescending');
        default:
            return t('sort.noSorting');
    }
};

const SortItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        label: string;
        value: SortByDirection | 'none';
        selected: boolean;
    }
>(({ value, label: _label, selected: _selected, ...others }, ref) => {
    const { t } = useTranslation('dataViz');
    return (
        <Box ref={ref} {...others}>
            <Text>{getSortLabel(t, value === 'none' ? undefined : value)}</Text>
        </Box>
    );
});

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
    const { t } = useTranslation('dataViz');
    const selectOptions = [
        {
            value: 'none',
            label: t('sort.noSorting'),
        },
        {
            value: SortByDirection.ASC,
            label: t('sort.ascending'),
        },
        {
            value: SortByDirection.DESC,
            label: t('sort.descending'),
        },
    ];

    return (
        <Tooltip label={t('sort.tooltip')}>
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
