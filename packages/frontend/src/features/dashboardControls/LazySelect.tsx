import { getItemId, type DashboardFilterableField } from '@lightdash/common';
import { Combobox, Input, InputBase, Select, Text } from '@mantine/core';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type FocusEvent,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import FieldSelect from '../../components/common/FieldSelect';
import { getFieldSelectLabel } from '../../components/common/FieldSelect/fieldSelectLabel';

// Past this many columns the dropdown is searchable
const SEARCH_THRESHOLD = 8;

// A field tile's fields go through the shipped field select, as the shipped
// tile select lists them; a SQL tile's columns through a plain select
type SelectOptions =
    | { kind: 'fields'; fields: DashboardFilterableField[] }
    | { kind: 'columns'; columns: string[] };

type Props = {
    'aria-label': string;
    leftSection: ReactNode;
    options: SelectOptions;
    nothingFoundMessage: string;
    // Null shows the placeholder; a value can be cleared back to null
    value: string | null;
    placeholder: string;
    // Accessible name of the clear button
    clearLabel: string;
    onChange: (value: string | null) => void;
};

// A closed select costs a combobox, a popover and every option in the DOM,
// once per tile. This stands in for it and mounts the real one, already open,
// on the first click or opening key press.
export const LazySelect: FC<Props> = ({
    'aria-label': ariaLabel,
    leftSection,
    options,
    nothingFoundMessage,
    value,
    placeholder,
    clearLabel,
    onChange,
}) => {
    const [isActivated, setIsActivated] = useState(false);
    const [isListOpen, setIsListOpen] = useState(true);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Mantine hides its clear button from the keyboard and screen readers;
    // here it is the only way to clear, so it is a named tab stop
    const clearButtonProps = {
        'aria-label': clearLabel,
        'aria-hidden': false,
        tabIndex: 0,
        // The button unmounts once cleared: keep keyboard focus on the select
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
            if (event.currentTarget !== document.activeElement) return;
            (triggerRef.current ?? inputRef.current)?.focus();
        },
    };

    const searchable =
        options.kind === 'fields' || options.columns.length > SEARCH_THRESHOLD;
    const valueField =
        options.kind === 'fields' && value !== null
            ? options.fields.find((field) => getItemId(field) === value)
            : undefined;

    // The page scrolls as a whole, so a tile slides under the pinned bar
    // without being clipped. The list closes once its select is covered
    const isListShown = isActivated && isListOpen;
    useEffect(() => {
        if (!isListShown) return;
        const closeWhenCovered = () => {
            const input = inputRef.current;
            if (input === null || !document.elementFromPoint) return;
            const { left, top, width, height } = input.getBoundingClientRect();
            const onTop = document.elementFromPoint(
                left + width / 2,
                top + height / 2,
            );
            // Null is off screen; its own wrapper holds the icons around it
            if (onTop === null || !input.parentElement?.contains(onTop))
                setIsListOpen(false);
        };
        window.addEventListener('scroll', closeWhenCovered, {
            capture: true,
            passive: true,
        });
        return () =>
            window.removeEventListener('scroll', closeWhenCovered, true);
    }, [isListShown]);

    if (!isActivated) {
        const activate = () => setIsActivated(true);
        const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            activate();
        };
        // The label the shipped field select gives the value
        const label =
            options.kind === 'fields'
                ? valueField && getFieldSelectLabel(valueField, false)
                : (options.columns.find((column) => column === value) ??
                  undefined);
        return (
            <InputBase
                ref={triggerRef}
                component="button"
                type="button"
                size="xs"
                pointer
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={false}
                leftSection={leftSection}
                // The same sections the real select builds, so nothing moves
                // when it takes over. Clearing does not mount it.
                __defaultRightSection={<Combobox.Chevron size="xs" />}
                __clearSection={
                    <Combobox.ClearButton
                        {...clearButtonProps}
                        onClear={() => onChange(null)}
                    />
                }
                __clearable={value !== null}
                rightSectionPointerEvents="none"
                // Enter and Space reach a button as a click
                onClick={activate}
                onKeyDown={handleKeyDown}
            >
                <Text component="span" display="block" inherit truncate>
                    {label ?? (
                        <Input.Placeholder>{placeholder}</Input.Placeholder>
                    )}
                </Text>
            </InputBase>
        );
    }

    const sharedProps = {
        size: 'xs',
        'aria-label': ariaLabel,
        clearable: true,
        clearButtonProps,
        placeholder,
        autoFocus: true,
        dropdownOpened: isListOpen,
        onDropdownOpen: () => setIsListOpen(true),
        onDropdownClose: () => setIsListOpen(false),
        // Focus alone never opens the list: clearing puts focus back here
        openOnFocus: false,
        comboboxProps: { withinPortal: true },
        leftSection,
        searchable,
        // Typing replaces the current choice instead of appending to it
        onFocus: (event: FocusEvent<HTMLInputElement>) => {
            if (searchable) event.currentTarget.select();
        },
        nothingFoundMessage,
    } as const;

    if (options.kind === 'fields')
        return (
            <FieldSelect
                {...sharedProps}
                ref={inputRef}
                miw={0}
                item={valueField}
                items={options.fields}
                onChange={(field) => onChange(field ? getItemId(field) : null)}
            />
        );

    return (
        <Select
            {...sharedProps}
            ref={inputRef}
            allowDeselect={false}
            data={options.columns}
            value={value}
            onChange={onChange}
        />
    );
};
