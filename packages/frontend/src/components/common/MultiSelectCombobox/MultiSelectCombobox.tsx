import {
    Combobox,
    Pill,
    PillsInput,
    ScrollArea,
    useCombobox,
    type ComboboxProps,
    type PillsInputProps,
    type ScrollAreaProps,
} from '@mantine-8/core';
import {
    Fragment,
    forwardRef,
    useMemo,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import classes from './MultiSelectCombobox.module.css';

export type MultiSelectComboboxOption = {
    value: string;
    label: string;
    disabled?: boolean;
    group?: string;
};

type Props = Omit<PillsInputProps, 'onChange'> & {
    options: MultiSelectComboboxOption[];
    value: string[];
    selectedValues?: string[];
    searchValue: string;
    onSearchChange: (value: string) => void;
    onValueRemove: (value: string) => void;
    onOptionSubmit: (value: string) => void;
    onClear?: () => void;
    placeholder?: string;
    'data-autofocus'?: boolean;
    readOnly?: boolean;
    name?: string;
    form?: string;
    hiddenInputValuesDivider?: string;
    nothingFoundMessage?: ReactNode;
    createLabel?: ReactNode;
    onCreate?: (value: string) => void;
    shouldCreate?: (value: string) => boolean;
    hidePickedOptions?: boolean;
    maxDropdownHeight?: number;
    topContent?: ReactNode;
    footer?: ReactNode;
    comboboxProps?: ComboboxProps;
    scrollAreaProps?: ScrollAreaProps;
    renderOption?: (
        option: MultiSelectComboboxOption,
        selected: boolean,
    ) => ReactNode;
    renderPill?: (
        value: string,
        label: string,
        onRemove: () => void,
    ) => ReactNode;
    onDropdownOpen?: () => void;
    onDropdownClose?: () => void;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

const CREATE_VALUE = '__lightdash_create_value__';

export const MultiSelectCombobox = forwardRef<HTMLInputElement, Props>(
    (
        {
            options,
            value,
            selectedValues = value,
            searchValue,
            onSearchChange,
            onValueRemove,
            onOptionSubmit,
            onClear,
            placeholder,
            disabled,
            readOnly,
            name,
            form,
            hiddenInputValuesDivider,
            nothingFoundMessage,
            createLabel,
            onCreate,
            shouldCreate = (query) => query.trim().length > 0,
            hidePickedOptions = false,
            maxDropdownHeight = 250,
            topContent,
            footer,
            comboboxProps,
            scrollAreaProps,
            renderOption,
            renderPill,
            onDropdownOpen,
            onDropdownClose,
            onFocus,
            onBlur,
            onPaste,
            onKeyDown,
            autoFocus,
            'data-autofocus': dataAutofocus,
            ...pillsInputProps
        },
        ref,
    ) => {
        const combobox = useCombobox({
            onDropdownOpen: () => {
                combobox.updateSelectedOptionIndex('active');
                onDropdownOpen?.();
            },
            onDropdownClose: () => {
                combobox.resetSelectedOption();
                onDropdownClose?.();
            },
        });
        const labels = useMemo(
            () =>
                new Map(options.map((option) => [option.value, option.label])),
            [options],
        );
        const visibleOptions = hidePickedOptions
            ? options.filter((option) => !selectedValues.includes(option.value))
            : options;
        const groups = useMemo(() => {
            const grouped = new Map<string, MultiSelectComboboxOption[]>();
            const ungrouped: MultiSelectComboboxOption[] = [];
            const values = new Set<string>();
            visibleOptions.forEach((option) => {
                if (values.has(option.value)) {
                    if (import.meta.env.DEV) {
                        console.error(
                            `Duplicate MultiSelect option value: ${option.value}`,
                        );
                    }
                    return;
                }
                values.add(option.value);
                if (!option.group) {
                    ungrouped.push(option);
                    return;
                }
                const items = grouped.get(option.group) ?? [];
                items.push(option);
                grouped.set(option.group, items);
            });
            const result: Array<{
                group?: string;
                options: MultiSelectComboboxOption[];
            }> = Array.from(grouped, ([group, groupOptions]) => ({
                group,
                options: groupOptions,
            }));
            if (ungrouped.length > 0) {
                result.push({ options: ungrouped });
            }
            return result;
        }, [visibleOptions]);
        const trimmedSearch = searchValue.trim();
        const canCreate =
            !!onCreate &&
            shouldCreate(trimmedSearch) &&
            !options.some((option) => option.value === trimmedSearch);
        const hasOptions = visibleOptions.length > 0 || canCreate;

        const submitCreate = () => {
            if (!canCreate) return;
            onCreate(trimmedSearch);
            onSearchChange('');
            combobox.resetSelectedOption();
        };

        const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (
                event.key === 'Enter' &&
                canCreate &&
                combobox.getSelectedOptionIndex() === -1
            ) {
                event.preventDefault();
                submitCreate();
            } else if (
                event.key === 'Backspace' &&
                searchValue.length === 0 &&
                value.length > 0
            ) {
                onValueRemove(value[value.length - 1]);
            }
            onKeyDown?.(event);
        };

        return (
            <>
                <Combobox
                    store={combobox}
                    withinPortal
                    size={pillsInputProps.size}
                    {...comboboxProps}
                    onOptionSubmit={(nextValue) => {
                        if (nextValue === CREATE_VALUE) {
                            submitCreate();
                            return;
                        }
                        onOptionSubmit(nextValue);
                        onSearchChange('');
                        combobox.resetSelectedOption();
                    }}
                >
                    <Combobox.DropdownTarget>
                        <PillsInput
                            {...pillsInputProps}
                            disabled={disabled}
                            rightSection={
                                pillsInputProps.rightSection ??
                                (onClear && value.length > 0 ? (
                                    <Combobox.ClearButton onClear={onClear} />
                                ) : undefined)
                            }
                            rightSectionPointerEvents={
                                pillsInputProps.rightSectionPointerEvents ??
                                (onClear && value.length > 0
                                    ? 'all'
                                    : undefined)
                            }
                            onClick={() => {
                                if (!disabled && !readOnly) {
                                    combobox.openDropdown();
                                }
                            }}
                        >
                            <Pill.Group>
                                {value.map((itemValue) => {
                                    const label =
                                        labels.get(itemValue) ?? itemValue;
                                    const remove = () =>
                                        onValueRemove(itemValue);
                                    return renderPill ? (
                                        <Fragment key={itemValue}>
                                            {renderPill(
                                                itemValue,
                                                label,
                                                remove,
                                            )}
                                        </Fragment>
                                    ) : (
                                        <Pill
                                            key={itemValue}
                                            withRemoveButton={
                                                !disabled && !readOnly
                                            }
                                            disabled={disabled}
                                            onRemove={remove}
                                            removeButtonProps={{
                                                'aria-label': `Remove ${label}`,
                                                'aria-hidden': false,
                                                onMouseDown: (event) =>
                                                    event.preventDefault(),
                                            }}
                                        >
                                            {label}
                                        </Pill>
                                    );
                                })}
                                <Combobox.EventsTarget>
                                    <PillsInput.Field
                                        ref={ref}
                                        autoFocus={autoFocus}
                                        data-autofocus={dataAutofocus}
                                        value={searchValue}
                                        placeholder={
                                            value.length > 0
                                                ? undefined
                                                : placeholder
                                        }
                                        disabled={disabled}
                                        readOnly={readOnly}
                                        onChange={(event) => {
                                            onSearchChange(
                                                event.currentTarget.value,
                                            );
                                            combobox.openDropdown();
                                            combobox.updateSelectedOptionIndex();
                                        }}
                                        onFocus={(event) => {
                                            combobox.openDropdown();
                                            onFocus?.(event);
                                        }}
                                        onBlur={(event) => {
                                            combobox.closeDropdown();
                                            onBlur?.(event);
                                        }}
                                        onPaste={onPaste}
                                        onKeyDown={handleKeyDown}
                                    />
                                </Combobox.EventsTarget>
                            </Pill.Group>
                        </PillsInput>
                    </Combobox.DropdownTarget>

                    <Combobox.Dropdown hidden={disabled || readOnly}>
                        <Combobox.Options>
                            <ScrollArea.Autosize
                                mah={maxDropdownHeight}
                                type="scroll"
                                scrollbarSize="var(--combobox-padding)"
                                offsetScrollbars="y"
                                {...scrollAreaProps}
                            >
                                {topContent}
                                {groups.map((group, groupIndex) => {
                                    const children = group.options.map(
                                        (option) => {
                                            const selected =
                                                selectedValues.includes(
                                                    option.value,
                                                );
                                            return (
                                                <Combobox.Option
                                                    key={option.value}
                                                    value={option.value}
                                                    disabled={option.disabled}
                                                    active={selected}
                                                    className={classes.option}
                                                    fz="sm"
                                                    ff="inherit"
                                                    px="sm"
                                                    py="xxs"
                                                >
                                                    {renderOption?.(
                                                        option,
                                                        selected,
                                                    ) ?? option.label}
                                                </Combobox.Option>
                                            );
                                        },
                                    );
                                    return group.group ? (
                                        <Combobox.Group
                                            key={`${group.group}-${groupIndex}`}
                                            label={group.group}
                                            fz="sm"
                                            ff="inherit"
                                            px="sm"
                                        >
                                            {children}
                                        </Combobox.Group>
                                    ) : (
                                        children
                                    );
                                })}
                                {canCreate && (
                                    <Combobox.Option
                                        value={CREATE_VALUE}
                                        data-create-option
                                        fz="sm"
                                        ff="inherit"
                                        px="sm"
                                        py="xxs"
                                    >
                                        {createLabel ??
                                            `Add "${trimmedSearch}"`}
                                    </Combobox.Option>
                                )}
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
                {name && (
                    <Combobox.HiddenInput
                        name={name}
                        form={form}
                        value={selectedValues}
                        valuesDivider={hiddenInputValuesDivider}
                        disabled={disabled}
                    />
                )}
            </>
        );
    },
);

MultiSelectCombobox.displayName = 'MultiSelectCombobox';
