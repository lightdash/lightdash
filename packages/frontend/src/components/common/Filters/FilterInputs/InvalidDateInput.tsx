import { TextInput, Popover } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('filters');
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
        <Popover {...popoverProps} opened={opened} onClose={closePopover}>
            <Popover.Target>
                <TextInput
                    w="100%"
                    size="xs"
                    data-autofocus={autoFocus || undefined}
                    value={value}
                    error={t('inputs.invalidDate')}
                    disabled={disabled}
                    readOnly
                    styles={{ input: { cursor: 'pointer' } }}
                    onClick={openPopover}
                />
            </Popover.Target>
            <Popover.Dropdown>
                {children({ close: closePopover })}
            </Popover.Dropdown>
        </Popover>
    );
};

export default InvalidDateInput;
