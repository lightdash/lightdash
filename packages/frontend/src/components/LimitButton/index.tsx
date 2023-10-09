import { Popover, Tooltip } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { FC, memo } from 'react';
import LimitBadge from './LimitBadge';
import LimitForm from './LimitForm';

export type Props = {
    disabled?: boolean;
    limit: number;
    isEditMode: boolean;
    onLimitChange: (value: number) => void;
};

const LimitButton: FC<Props> = memo(
    ({ disabled, isEditMode, limit, onLimitChange }) => {
        const [opened, { open, close }] = useDisclosure(false);
        const ref = useClickOutside(
            () => setTimeout(() => close(), 0),
            ['mouseup', 'touchend'],
        );

        const handleLimitChange = (value: number) => {
            onLimitChange(value);
            close();
        };

        return isEditMode ? (
            <Popover
                disabled={disabled}
                opened={opened}
                position="top"
                withArrow
                shadow="md"
                arrowSize={10}
                offset={2}
            >
                <Popover.Target>
                    <LimitBadge
                        limit={limit}
                        onClick={opened ? undefined : open}
                        disabled={disabled}
                    />
                </Popover.Target>

                <Popover.Dropdown>
                    <LimitForm
                        ref={ref}
                        limit={limit}
                        onLimitChange={handleLimitChange}
                    />
                </Popover.Dropdown>
            </Popover>
        ) : (
            <Tooltip
                label="You must be in 'edit' or 'explore' mode to update the limit"
                position="top"
            >
                <LimitBadge limit={limit} disabled={!isEditMode || disabled} />
            </Tooltip>
        );
    },
);

export default LimitButton;
