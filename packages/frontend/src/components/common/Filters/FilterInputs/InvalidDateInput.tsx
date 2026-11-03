import { TextInput, Popover } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type FC, type ReactNode } from 'react';
import classes from './InvalidDateInput.module.css';

type Props = {
    value: string;
    disabled?: boolean;
    popoverProps?: any;
    autoFocus?: boolean;
    children: ({ close }: { close: () => void }) => ReactNode;
};

const InvalidDateInput: FC<Props> = ({
    value,
    disabled,
    popoverProps,
    autoFocus,
    children,
}) => {
    const [opened, { open, close }] = useDisclosure(false);

    const openPopover = () => {
        if (disabled) return;
        popoverProps?.onOpen?.();
        open();
    };

    const closePopover = () => {
        popoverProps?.onClose?.();
        close();
    };

    return (
        <Popover
            {...popoverProps}
            opened={opened}
            onChange={(isOpened) => {
                if (!isOpened) closePopover();
            }}
        >
            <Popover.Target>
                <TextInput
                    w="100%"
                    size="xs"
                    data-autofocus={autoFocus || undefined}
                    value={value}
                    error="Invalid date"
                    disabled={disabled}
                    readOnly
                    classNames={{ input: classes.input }}
                    onClick={openPopover}
                    // As Mantine's own lists do: a host Modal leaves this Escape
                    data-mantine-stop-propagation={opened || undefined}
                    onKeyDown={(event) => {
                        if (event.key !== 'Escape' || !opened) return;
                        // Consumed, so a host modal stays open
                        event.preventDefault();
                        closePopover();
                    }}
                />
            </Popover.Target>
            <Popover.Dropdown>
                {children({ close: closePopover })}
            </Popover.Dropdown>
        </Popover>
    );
};

export default InvalidDateInput;
