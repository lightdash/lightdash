import { type ResultColumn } from '@lightdash/common';
import { Select, Text, type PopoverProps } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';

type Props = {
    columns: ResultColumn[];
    value: string | undefined;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChange: (column: ResultColumn) => void;
};

const SqlColumnSelect: FC<Props> = ({
    columns,
    value,
    popoverProps,
    onChange,
}) => {
    const getUiString = useUiStrings();

    return (
        <Select
            allowDeselect={false}
            size="xs"
            label={
                <Text fw={500} fz="sm">
                    {getUiString('filters.config.selectColumn')}{' '}
                    <Text c="red" span>
                        *
                    </Text>{' '}
                </Text>
            }
            placeholder={getUiString('filters.config.searchColumnPlaceholder')}
            comboboxProps={{
                withinPortal: popoverProps?.withinPortal,
            }}
            onDropdownOpen={popoverProps?.onOpen}
            onDropdownClose={popoverProps?.onClose}
            value={value}
            data={columns.map(({ reference }) => reference)}
            onChange={(newValue) => {
                if (!newValue) return;
                const selectedColumn = columns.find(
                    (column) => column.reference === newValue,
                );
                if (!selectedColumn) return;
                onChange(selectedColumn);
            }}
        />
    );
};

export default SqlColumnSelect;
