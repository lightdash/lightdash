import { Button, Popover, type MantineSize } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import LimitForm from './LimitForm';

export type Props = {
    size?: MantineSize;
    disabled?: boolean;
    maxLimit: number;
    limit: number;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(
    ({ size, disabled, maxLimit, limit, onLimitChange }) => {
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
                position="bottom-end"
                withArrow
                shadow="md"
                offset={2}
                arrowOffset={10}
            >
                <Popover.Target>
                    <Button
                        size={size}
                        p="xs"
                        disabled={disabled}
                        onClick={opened ? undefined : open}
                    >
                        <MantineIcon icon={IconChevronDown} size="sm" />
                    </Button>
                </Popover.Target>

                <Popover.Dropdown>
                    <LimitForm
                        ref={ref}
                        maxLimit={maxLimit}
                        limit={limit}
                        onLimitChange={handleLimitChange}
                    />
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export default LimitButton;
