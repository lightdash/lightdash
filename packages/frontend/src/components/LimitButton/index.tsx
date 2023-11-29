import { Button, Popover } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { FC, memo } from 'react';
import MantineIcon from '../common/MantineIcon';
import LimitForm from './LimitForm';

export type Props = {
    disabled?: boolean;
    limit: number;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(({ disabled, limit, onLimitChange }) => {
    const [opened, { open, close }] = useDisclosure(false);
    const ref = useClickOutside(
        () => setTimeout(() => close(), 0),
        ['mouseup', 'touchend'],
    );

    const handleLimitChange = (value: number) => {
        onLimitChange(value);
        close();
    };

    return (
        <Popover
            withinPortal
            disabled={disabled}
            opened={opened}
            position="right-end"
            withArrow
            shadow="md"
            arrowSize={10}
            offset={2}
        >
            <Popover.Target>
                <Button
                    p="xs"
                    disabled={disabled}
                    onClick={opened ? undefined : open}
                >
                    <MantineIcon icon={IconChevronDown} size="lg" />
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <LimitForm
                    ref={ref}
                    limit={limit}
                    onLimitChange={handleLimitChange}
                />
            </Popover.Dropdown>
        </Popover>
    );
});

export default LimitButton;
