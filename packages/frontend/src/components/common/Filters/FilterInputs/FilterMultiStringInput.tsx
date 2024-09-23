import { Group, MultiSelect, Text, type MultiSelectProps } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../MantineIcon';
import MultiValuePastePopover from './MultiValuePastePopover';

type Props = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    values: string[];
    onChange: (values: string[]) => void;
};

const FilterMultiStringInput: FC<Props> = ({
    values,
    disabled,
    onChange,
    placeholder,
    ...rest
}) => {
    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const [resultsSets] = useState([]);

    const results = useMemo(() => [...resultsSets], [resultsSets]);

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            onChange(uniq(updatedValues));
        },
        [onChange],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            handleChange([...values, newValue]);
            return newValue;
        },
        [handleChange, values],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            handleChange([...values, ...newValues]);
            return newValues;
        },
        [handleChange, values],
    );

    const handlePaste = useCallback(
        (event: React.ClipboardEvent<HTMLInputElement>) => {
            const clipboardData = event.clipboardData.getData('Text');
            if (clipboardData.includes(',') || clipboardData.includes('\n')) {
                setTempPasteValues(clipboardData);
                setPastePopUpOpened(true);
            }
        },
        [],
    );

    const data = useMemo(() => {
        // Mantine does not show value tag if value is not found in data
        // so we need to add it manually here
        // also we are merging status indicator as a first item
        return uniq([...results, ...values]).map((value) => ({
            value,
            label: value,
        }));
    }, [results, values]);

    return (
        <MultiValuePastePopover
            opened={pastePopUpOpened}
            onClose={() => {
                setPastePopUpOpened(false);
                setTempPasteValues(undefined);
                handleResetSearch();
            }}
            onMultiValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                const clipboardDataArray = tempPasteValues
                    .split(/\,|\n/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                handleAddMultiple(clipboardDataArray);
            }}
            onSingleValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                handleAdd(tempPasteValues);
            }}
        >
            <MultiSelect
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                creatable
                getCreateLabel={(query) => (
                    <Group spacing="xxs">
                        <MantineIcon icon={IconPlus} color="blue" size="sm" />
                        <Text color="blue">Add "{query}"</Text>
                    </Group>
                )}
                styles={{
                    item: {
                        // makes add new item button sticky to bottom
                        '&:last-child:not([value])': {
                            position: 'sticky',
                            bottom: 4,
                            // casts shadow on the bottom of the list to avoid transparency
                            boxShadow: '0 4px 0 0 white',
                        },
                        '&:last-child:not([value]):not(:hover)': {
                            background: 'white',
                        },
                    },
                }}
                disableSelectedItemFiltering={false}
                searchable
                clearSearchOnChange
                {...rest}
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                nothingFound={'Please type to add the filter value'}
                data={data}
                value={values}
                onDropdownClose={handleResetSearch}
                onChange={handleChange}
                onCreate={handleAdd}
            />
        </MultiValuePastePopover>
    );
};

export default FilterMultiStringInput;
