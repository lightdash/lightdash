import { TagsInput, type TagsInputProps } from '@mantine-8/core';
import uniq from 'lodash/uniq';
import { useCallback, useMemo, useState, type FC } from 'react';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = Omit<
    TagsInputProps,
    'acceptValueOnBlur' | 'data' | 'onChange' | 'value'
> & {
    values: string[];
    onChange: (values: string[]) => void;
};

const FilterMultiStringInput: FC<Props> = ({
    values,
    disabled,
    onChange,
    placeholder,
    onBlur: onInputBlur,
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

    const handleBlur = useCallback(
        (event: React.FocusEvent<HTMLInputElement>) => {
            if (search !== '' && !pastePopUpOpened) {
                handleAdd(search);
                handleResetSearch();
            }
            onInputBlur?.(event);
        },
        [handleAdd, handleResetSearch, onInputBlur, pastePopUpOpened, search],
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
            label: formatDisplayValue(value),
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
            <TagsInput
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                acceptValueOnBlur={false}
                splitChars={[]}
                styles={{
                    pillsList: {
                        maxHeight: '350px',
                        overflowY: 'auto',
                    },
                }}
                {...rest}
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                data={data}
                value={values}
                onDropdownClose={handleResetSearch}
                onChange={handleChange}
                onBlur={handleBlur}
            />
        </MultiValuePastePopover>
    );
};

export default FilterMultiStringInput;
