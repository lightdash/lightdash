import { Combobox, InputBase, Select, Text } from '@mantine/core';
import { useState, type FC, type KeyboardEvent, type ReactNode } from 'react';

type Option = { value: string; label: string };

type Props = {
    'aria-label': string;
    leftSection: ReactNode;
    data: Option[];
    value: string;
    onChange: (value: string) => void;
};

// A closed select costs a combobox, a popover and every option in the DOM,
// once per tile. This stands in for it and mounts the real one, already open,
// on the first click or opening key press.
export const LazySelect: FC<Props> = ({
    'aria-label': ariaLabel,
    leftSection,
    data,
    value,
    onChange,
}) => {
    const [isActivated, setIsActivated] = useState(false);

    if (!isActivated) {
        const activate = () => setIsActivated(true);
        const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            activate();
        };
        return (
            <InputBase
                component="button"
                type="button"
                size="xs"
                pointer
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={false}
                leftSection={leftSection}
                rightSection={<Combobox.Chevron size="xs" />}
                rightSectionPointerEvents="none"
                // Enter and Space reach a button as a click
                onClick={activate}
                onKeyDown={handleKeyDown}
            >
                <Text component="span" display="block" inherit truncate>
                    {data.find((option) => option.value === value)?.label}
                </Text>
            </InputBase>
        );
    }

    return (
        <Select
            size="xs"
            aria-label={ariaLabel}
            allowDeselect={false}
            autoFocus
            defaultDropdownOpened
            comboboxProps={{ withinPortal: true }}
            leftSection={leftSection}
            data={data}
            value={value}
            onChange={(next) => {
                if (next !== null) onChange(next);
            }}
        />
    );
};
