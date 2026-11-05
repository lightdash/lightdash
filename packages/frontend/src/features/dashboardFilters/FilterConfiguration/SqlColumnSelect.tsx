import { type ResultColumn } from '@lightdash/common';
import { Loader, Select, Text, type PopoverProps } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useIsSqlTileQueryRunning } from './useIsSqlTileQueryRunning';

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
    const isLoading = useIsSqlTileQueryRunning();
    // Controlled: Select resets its own search whenever the options change
    const [search, setSearch] = useState('');
    const data = useMemo(
        () => columns.map(({ reference }) => reference),
        [columns],
    );

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
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            aria-busy={isLoading}
            rightSection={isLoading ? <Loader size="xs" /> : undefined}
            data={data}
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
