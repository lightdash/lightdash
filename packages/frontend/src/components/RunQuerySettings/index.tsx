import {
    Button,
    Divider,
    Popover,
    Stack,
    type ButtonProps,
    type MantineSize,
} from '@mantine-8/core';
import { useClickOutside, useDisclosure } from '@mantine-8/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import { memo, useEffect, useState, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import AutoFetchResultsSwitch from './AutoFetchResultsSwitch';
import LimitInput from './LimitInput';

export type Props = {
    size?: MantineSize;
    disabled?: boolean;
    maxLimit: number;
    limit: number;
    onLimitChange: (value: number) => void;
    showAutoFetchSetting?: boolean;
    targetProps?: ButtonProps;
};

const RunQuerySettings: FC<Props> = memo(
    ({
        size,
        disabled,
        maxLimit,
        limit,
        onLimitChange,
        showAutoFetchSetting = false,
        targetProps,
    }) => {
        const [opened, { open, close }] = useDisclosure(false);
        const ref = useClickOutside(
            () => setTimeout(() => close(), 0),
            ['mouseup', 'touchend'],
        );

        const [tempLimit, setTempLimit] = useState(limit);

        useEffect(() => {
            setTempLimit(limit);
        }, [limit]);

        const handleLimitChange = (value: number) => {
            setTempLimit(value);
        };

        const handleLimitBlur = () => {
            if (tempLimit !== limit) {
                onLimitChange(tempLimit);
            }
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
                        {...targetProps}
                    >
                        <MantineIcon icon={IconChevronDown} size="sm" />
                    </Button>
                </Popover.Target>

                <Popover.Dropdown>
                    <Stack ref={ref}>
                        {showAutoFetchSetting && (
                            <AutoFetchResultsSwitch size={size} />
                        )}
                        {showAutoFetchSetting && <Divider />}
                        <LimitInput
                            maxLimit={maxLimit}
                            limit={tempLimit}
                            onLimitChange={handleLimitChange}
                            size={size}
                            numberInputProps={{
                                onBlur: handleLimitBlur,
                            }}
                        />
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export default RunQuerySettings;
