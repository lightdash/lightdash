import {
    Combobox,
    InputBase,
    ScrollArea,
    defaultOptionsFilter,
    getOptionsLockup,
    getParsedComboboxData,
    isOptionsGroup,
    useCombobox,
    type ComboboxItem,
    type ComboboxParsedItem,
    type ComboboxProps,
    type ScrollAreaProps,
    type SelectProps,
} from '@mantine-8/core';
import { useUncontrolled } from '@mantine-8/hooks';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';

type Props = Omit<
    SelectProps,
    | 'allowDeselect'
    | 'checkIconPosition'
    | 'classNames'
    | 'clearButtonProps'
    | 'defaultDropdownOpened'
    | 'defaultSearchValue'
    | 'defaultValue'
    | 'dropdownOpened'
    | 'filter'
    | 'hiddenInputProps'
    | 'onClear'
    | 'onDropdownClose'
    | 'onDropdownOpen'
    | 'onOptionSubmit'
    | 'renderOption'
    | 'scrollAreaProps'
    | 'selectFirstOptionOnChange'
    | 'styles'
    | 'withCheckIcon'
    | 'withScrollArea'
> & {
    footer: ReactNode;
    scrollAreaProps?: ScrollAreaProps;
    classNames?: ComboboxProps['classNames'];
    styles?: ComboboxProps['styles'];
};

const renderOptions = (
    data: ComboboxParsedItem[],
    selectedValue: string | null,
): ReactNode =>
    data.map((item) =>
        isOptionsGroup(item) ? (
            <Combobox.Group key={item.group} label={item.group}>
                {renderOptions(item.items, selectedValue)}
            </Combobox.Group>
        ) : (
            <Combobox.Option
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                active={item.value === selectedValue}
            >
                {item.label}
            </Combobox.Option>
        ),
    );

export const SelectWithFooter: FC<Props> = ({
    data,
    value,
    onChange,
    searchable = false,
    searchValue,
    onSearchChange,
    clearable,
    disabled,
    readOnly,
    rightSection,
    rightSectionPointerEvents,
    maxDropdownHeight = 250,
    nothingFoundMessage,
    comboboxProps,
    footer,
    scrollAreaProps,
    name,
    form,
    id,
    onFocus,
    onBlur,
    onClick,
    classNames,
    styles,
    unstyled,
    size,
    error,
    ...inputProps
}) => {
    const parsedData = useMemo(() => getParsedComboboxData(data), [data]);
    const optionsLockup = useMemo(
        () => getOptionsLockup(parsedData),
        [parsedData],
    );
    const selectedOption = value ? optionsLockup[value] : undefined;
    const [search, setSearch] = useUncontrolled({
        value: searchValue,
        finalValue: selectedOption?.label ?? '',
        onChange: onSearchChange,
    });
    const combobox = useCombobox({
        onDropdownOpen: () =>
            combobox.updateSelectedOptionIndex('active', {
                scrollIntoView: true,
            }),
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    useEffect(() => {
        setSearch(selectedOption?.label ?? '');
    }, [selectedOption?.label, selectedOption?.value, setSearch]);
    const filteredData = searchable
        ? defaultOptionsFilter({
              options: parsedData,
              search:
                  selectedOption?.label === search ? '' : search.toLowerCase(),
              limit: Infinity,
          })
        : parsedData;
    const hasOptions = filteredData.some((item) =>
        isOptionsGroup(item) ? item.items.length > 0 : true,
    );
    const clearButton = clearable && value && !disabled && !readOnly && (
        <Combobox.ClearButton
            onClear={() => {
                onChange?.(null, {} as ComboboxItem);
                setSearch('');
            }}
        />
    );

    return (
        <>
            <Combobox
                store={combobox}
                onOptionSubmit={(nextValue) => {
                    const option = optionsLockup[nextValue];
                    onChange?.(nextValue, option);
                    setSearch(option.label);
                    combobox.closeDropdown();
                }}
                classNames={classNames}
                styles={styles}
                unstyled={unstyled}
                readOnly={readOnly}
                size={size}
                {...comboboxProps}
            >
                <Combobox.Target targetType={searchable ? 'input' : 'button'}>
                    <InputBase
                        id={id}
                        {...inputProps}
                        size={size}
                        disabled={disabled}
                        readOnly={readOnly || !searchable}
                        value={search}
                        error={error}
                        rightSection={
                            rightSection ??
                            clearButton ?? <Combobox.Chevron size={size} />
                        }
                        rightSectionPointerEvents={
                            rightSectionPointerEvents ??
                            (clearButton ? 'all' : 'none')
                        }
                        onChange={(event) => {
                            setSearch(event.currentTarget.value);
                            combobox.openDropdown();
                            combobox.resetSelectedOption();
                        }}
                        onFocus={(event) => {
                            if (searchable) combobox.openDropdown();
                            onFocus?.(event);
                        }}
                        onBlur={(event) => {
                            combobox.closeDropdown();
                            setSearch(selectedOption?.label ?? '');
                            onBlur?.(event);
                        }}
                        onClick={(event) => {
                            if (searchable) {
                                combobox.openDropdown();
                            } else {
                                combobox.toggleDropdown();
                            }
                            onClick?.(event);
                        }}
                    />
                </Combobox.Target>

                <Combobox.Dropdown hidden={disabled || readOnly}>
                    <Combobox.Options>
                        <ScrollArea.Autosize
                            mah={maxDropdownHeight}
                            type="scroll"
                            scrollbarSize="var(--combobox-padding)"
                            offsetScrollbars="y"
                            {...scrollAreaProps}
                        >
                            {renderOptions(filteredData, value ?? null)}
                            {!hasOptions && nothingFoundMessage && (
                                <Combobox.Empty>
                                    {nothingFoundMessage}
                                </Combobox.Empty>
                            )}
                        </ScrollArea.Autosize>
                    </Combobox.Options>
                    {footer && (
                        <Combobox.Footer
                            onMouseDown={(event) => event.preventDefault()}
                        >
                            {footer}
                        </Combobox.Footer>
                    )}
                </Combobox.Dropdown>
            </Combobox>
            <Combobox.HiddenInput
                value={value ?? ''}
                name={name}
                form={form}
                disabled={disabled}
            />
        </>
    );
};
