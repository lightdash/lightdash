import { type TimezoneSetting } from '@lightdash/common';
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
import { memo, useCallback, useEffect, useRef, useState, type FC } from 'react';
import ChartTimezoneSelect from '../common/ChartTimezoneSelect';
import MantineIcon from '../common/MantineIcon';
import AutoFetchResultsSwitch from './AutoFetchResultsSwitch';
import LimitInput from './LimitInput';
import PreAggregateCacheSwitch from './PreAggregateCacheSwitch';

export type Props = {
    size?: MantineSize;
    disabled?: boolean;
    maxLimit: number;
    limit: number;
    onLimitChange: (value: number) => void;
    showAutoFetchSetting?: boolean;
    showPreAggregateSetting?: boolean;
    showTimezoneSetting?: boolean;
    timezone?: string;
    onTimezoneChange?: (value: TimezoneSetting) => void;
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
        showPreAggregateSetting = false,
        showTimezoneSetting = false,
        timezone,
        onTimezoneChange,
        targetProps,
    }) => {
        const [opened, { open, close }] = useDisclosure(false);
        const mouseDownInsideRef = useRef(false);
        const handleClickOutside = useCallback(() => {
            if (mouseDownInsideRef.current) {
                mouseDownInsideRef.current = false;
                return;
            }
            setTimeout(() => close(), 0);
        }, [close]);
        const ref = useClickOutside(handleClickOutside, [
            'mouseup',
            'touchend',
        ]);

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

        const hasToggleSettings =
            showAutoFetchSetting || showPreAggregateSetting;

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
                    <Stack
                        ref={ref}
                        gap="sm"
                        w={232}
                        onMouseDown={() => {
                            mouseDownInsideRef.current = true;
                        }}
                    >
                        {hasToggleSettings && (
                            <Stack gap="xs">
                                {showPreAggregateSetting && (
                                    <PreAggregateCacheSwitch size={size} />
                                )}
                                {showAutoFetchSetting && (
                                    <AutoFetchResultsSwitch size={size} />
                                )}
                            </Stack>
                        )}
                        {hasToggleSettings && <Divider />}
                        <LimitInput
                            maxLimit={maxLimit}
                            limit={tempLimit}
                            onLimitChange={handleLimitChange}
                            size={size}
                            numberInputProps={{
                                onBlur: handleLimitBlur,
                                onKeyDown: (e) => {
                                    if (e.key === 'Enter') {
                                        handleLimitBlur();
                                        close();
                                    }
                                },
                            }}
                        />
                        {showTimezoneSetting && onTimezoneChange && (
                            <ChartTimezoneSelect
                                label="Timezone"
                                value={timezone}
                                onChange={onTimezoneChange}
                                w="100%"
                            />
                        )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export default RunQuerySettings;
