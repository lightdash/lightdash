import { Group, MultiSelect, Text, type MultiSelectProps } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { uniq } from 'lodash';
import { useCallback, useState, type FC } from 'react';
import MultiValuePastePopover from '../../../../components/common/Filters/FilterInputs/MultiValuePastePopover';
import MantineIcon from '../../../../components/common/MantineIcon';

type MultiStringInputProps = Omit<MultiSelectProps, 'data' | 'onChange'> & {
    values: string[];
    onChange: (values: string[]) => void;
};

const MultiStringInput: FC<MultiStringInputProps> = ({
    values,
    onChange,
    disabled,
    placeholder,
    ...rest
}) => {
    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

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
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                nothingFound={'Please type to add the filter value'}
                data={values}
                value={values}
                onDropdownClose={handleResetSearch}
                onChange={handleChange}
                onCreate={handleAdd}
                {...rest}
            />
        </MultiValuePastePopover>
    );
};

export default MultiStringInput;
