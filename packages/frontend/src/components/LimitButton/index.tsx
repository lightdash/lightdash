import { Button, MantineSize, Popover } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { FC, memo } from 'react';
import MantineIcon from '../common/MantineIcon';
import LimitForm from './LimitForm';

export type Props = {
    size?: MantineSize;
    disabled?: boolean;
    limit: number;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(
    ({ size, disabled, limit, onLimitChange }) => {
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
                position="top"
                withArrow
                shadow="md"
                arrowSize={10}
                offset={2}
            >
                <Popover.Target>
                    <Button
                        size={size}
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
    },
);

export default LimitButton;
