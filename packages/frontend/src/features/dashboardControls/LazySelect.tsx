import { Combobox, Group, Input, InputBase, Select, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type Option = { value: string; label: string };
export type OptionGroup = { label: string; items: Option[] };

type Props = {
    'aria-label': string;
    leftSection: ReactNode;
    // Listed in order. Labels show only when two or more groups have entries
    groups: OptionGroup[];
    searchable: boolean;
    nothingFoundMessage: string;
    // Null shows the placeholder; a value can be cleared back to null
    value: string | null;
    placeholder: string;
    // Accessible name of the clear button
    clearLabel: string;
    // The symbol shown before an option, or null for none. Keep it stable
    renderOptionIcon: ((value: string) => ReactNode) | null;
    onChange: (value: string | null) => void;
};

// A closed select costs a combobox, a popover and every option in the DOM,
// once per tile. This stands in for it and mounts the real one, already open,
// on the first click or opening key press.
export const LazySelect: FC<Props> = ({
    'aria-label': ariaLabel,
    leftSection,
    groups,
    searchable,
    nothingFoundMessage,
    value,
    placeholder,
    clearLabel,
    renderOptionIcon,
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

    const filled = groups.filter((group) => group.items.length > 0);

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
        const label = filled
            .flatMap((group) => group.items)
            .find((option) => option.value === value)?.label;
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

    return (
        <Select
            ref={inputRef}
            size="xs"
            aria-label={ariaLabel}
            allowDeselect={false}
            clearable
            clearButtonProps={clearButtonProps}
            placeholder={placeholder}
            autoFocus
            dropdownOpened={isListOpen}
            onDropdownOpen={() => setIsListOpen(true)}
            onDropdownClose={() => setIsListOpen(false)}
            // Focus alone never opens the list: clearing puts focus back here
            openOnFocus={false}
            comboboxProps={{ withinPortal: true }}
            leftSection={leftSection}
            searchable={searchable}
            // Typing replaces the current choice instead of appending to it
            onFocus={(event) => {
                if (searchable) event.currentTarget.select();
            }}
            nothingFoundMessage={nothingFoundMessage}
            // Mantine labels a lone group too; one group is a plain list here
            data={
                filled.length > 1
                    ? filled.map((group) => ({
                          group: group.label,
                          items: group.items,
                      }))
                    : filled.flatMap((group) => group.items)
            }
            renderOption={
                renderOptionIcon === null
                    ? undefined
                    : ({ option, checked }) => (
                          <Group gap="xs" wrap="nowrap" w="100%">
                              {renderOptionIcon(option.value)}
                              <Text inherit truncate flex={1}>
                                  {option.label}
                              </Text>
                              {checked && (
                                  <MantineIcon
                                      icon={IconCheck}
                                      size={14}
                                      color="dimmed"
                                  />
                              )}
                          </Group>
                      )
            }
            value={value}
            onChange={onChange}
        />
    );
};
