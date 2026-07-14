import { Group, Text, type ComboboxProps } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useMemo,
    useState,
    type ClipboardEvent,
    type FC,
    type FocusEvent,
    type FocusEventHandler,
} from 'react';
import MantineIcon from '../../MantineIcon';
import {
    MultiSelectCombobox,
    type MultiSelectComboboxOption,
} from '../../MultiSelectCombobox/MultiSelectCombobox';
import MultiValuePastePopover from './MultiValuePastePopover';
import { formatDisplayValue } from './utils';

type Props = {
    values: string[];
    onChange: (values: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
    'data-autofocus'?: boolean;
    comboboxProps?: ComboboxProps;
    onDropdownOpen?: () => void;
    onDropdownClose?: () => void;
    onBlur?: FocusEventHandler<HTMLInputElement>;
};

const FilterMultiStringInput: FC<Props> = ({
    values,
    disabled,
    onChange,
    placeholder,
    onBlur: onInputBlur,
    onDropdownClose: onInputDropdownClose,
    ...rest
}) => {
    const [search, setSearch] = useState('');
    const [pastePopUpOpened, setPastePopUpOpened] = useState(false);
    const [tempPasteValues, setTempPasteValues] = useState<
        string | undefined
    >();

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, []);

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            onChange(uniq(updatedValues));
        },
        [onChange],
    );

    const handleAdd = useCallback(
        (newValue: string) => {
            handleChange([...values, newValue]);
        },
        [handleChange, values],
    );

    const handleAddMultiple = useCallback(
        (newValues: string[]) => {
            handleChange([...values, ...newValues]);
        },
        [handleChange, values],
    );

    const handleRemove = useCallback(
        (valueToRemove: string) => {
            handleChange(values.filter((value) => value !== valueToRemove));
        },
        [handleChange, values],
    );

    const handleBlur = useCallback(
        (event: FocusEvent<HTMLInputElement>) => {
            if (search !== '' && !pastePopUpOpened) {
                handleAdd(search);
                handleResetSearch();
            }
            onInputBlur?.(event);
        },
        [handleAdd, handleResetSearch, onInputBlur, pastePopUpOpened, search],
    );

    const handlePaste = useCallback(
        (event: ClipboardEvent<HTMLInputElement>) => {
            const clipboardData = event.clipboardData.getData('Text');
            if (clipboardData.includes(',') || clipboardData.includes('\n')) {
                // Keep the raw CSV out of the search field so nothing commits
                // before the user picks single vs multiple.
                event.preventDefault();
                setTempPasteValues(clipboardData);
                setPastePopUpOpened(true);
            }
        },
        [],
    );

    // Labels make whitespace/newlines visible so pills render formatted while
    // the stored value stays raw. Picked values are hidden from the dropdown,
    // leaving only the "Add value" create row.
    const options = useMemo<MultiSelectComboboxOption[]>(
        () =>
            values.map((value) => ({
                value,
                label: formatDisplayValue(value),
            })),
        [values],
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
                handleResetSearch();
            }}
            onSingleValue={() => {
                if (!tempPasteValues) {
                    setPastePopUpOpened(false);
                    return;
                }
                handleAdd(tempPasteValues);
                handleResetSearch();
            }}
        >
            <MultiSelectCombobox
                size="xs"
                w="100%"
                placeholder={
                    values.length > 0 || disabled ? undefined : placeholder
                }
                disabled={disabled}
                options={options}
                value={values}
                hidePickedOptions
                searchValue={search}
                onSearchChange={setSearch}
                onPaste={handlePaste}
                onOptionSubmit={handleAdd}
                onValueRemove={handleRemove}
                onClear={() => handleChange([])}
                onCreate={(value) => {
                    handleAdd(value);
                    handleResetSearch();
                }}
                shouldCreate={(query) =>
                    query.trim().length > 0 && !values.includes(query)
                }
                createLabel={
                    <Group gap="xxs">
                        <MantineIcon icon={IconPlus} color="blue.7" size="sm" />
                        <Text c="blue.7" fw={600}>
                            Add "{search.trim()}"
                        </Text>
                    </Group>
                }
                nothingFoundMessage="Please type to add the filter value"
                onDropdownClose={() => {
                    handleResetSearch();
                    onInputDropdownClose?.();
                }}
                onBlur={handleBlur}
                {...rest}
            />
        </MultiValuePastePopover>
    );
};

export default FilterMultiStringInput;
