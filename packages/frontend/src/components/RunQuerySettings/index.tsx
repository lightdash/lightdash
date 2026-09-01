import { type TimezoneSetting } from '@lightdash/common';
import {
    Button,
    Divider,
    Popover,
    Stack,
    Tooltip,
    type ButtonProps,
    type MantineSize,
} from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconX } from '@tabler/icons-react';
import { memo, useCallback, useRef, useState, type FC } from 'react';
import ChartTimezoneSelect from '../common/ChartTimezoneSelect';
import MantineIcon from '../common/MantineIcon';
import AutoFetchResultsSwitch from './AutoFetchResultsSwitch';
import LimitInput from './LimitInput';
import PreAggregateCacheSwitch from './PreAggregateCacheSwitch';
import classes from './RunQueryButton.module.css';

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
    /** While the query runs the same control cancels it, so the split button
     *  keeps its width. */
    isQueryRunning?: boolean;
    onCancelQuery?: () => void;
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
        isQueryRunning = false,
        onCancelQuery,
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

        const handleOpen = () => {
            setTempLimit(limit);
            open();
        };

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
        const showCancel = isQueryRunning && onCancelQuery !== undefined;

        return (
            <Popover
                withinPortal
                disabled={disabled || showCancel}
                opened={opened}
                position="bottom-end"
                withArrow
                shadow="md"
                offset={2}
                arrowOffset={10}
            >
                <Popover.Target>
                    <Tooltip
                        label="Cancel query"
                        position="bottom"
                        disabled={!showCancel}
                    >
                        <Button
                            size={size}
                            disabled={disabled}
                            onClick={
                                showCancel
                                    ? onCancelQuery
                                    : opened
                                      ? undefined
                                      : handleOpen
                            }
                            className={classes.attached}
                            aria-label={
                                showCancel ? 'Cancel query' : 'Query settings'
                            }
                            {...targetProps}
                        >
                            <MantineIcon
                                icon={showCancel ? IconX : IconChevronDown}
                                size="sm"
                            />
                        </Button>
                    </Tooltip>
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
