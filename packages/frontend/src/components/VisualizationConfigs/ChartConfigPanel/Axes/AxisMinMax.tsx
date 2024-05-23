import { Group, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useToggle } from 'react-use';
import { useTracking } from '../../../../providers/TrackingProvider';
import { EventName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import { Config } from '../../common/Config';

type Props = {
    label: string;
    min: string | undefined;
    minOffset?: string | undefined;
    max: string | undefined;
    maxOffset?: string | undefined;
    setMin: (value: string | undefined) => void;
    setMinOffset?: (value: string | undefined) => void;
    setMax: (value: string | undefined) => void;
    setMaxOffset?: (value: string | undefined) => void;
};

const DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE = '0.5';

export const AxisMinMax: FC<Props> = ({
    label,
    min,
    minOffset,
    max,
    maxOffset,
    setMin,
    setMinOffset,
    setMax,
    setMaxOffset,
}) => {
    const isSettingOffset = !!(setMinOffset && setMaxOffset);
    const [isAuto, toggleAuto] = useToggle(
        !(min || max || minOffset || maxOffset),
    );
    const { track } = useTracking();

    const clearRange = useCallback(() => {
        if (!isAuto) {
            setMin(undefined);
            setMinOffset?.(undefined);

            setMax(undefined);
            setMaxOffset?.(undefined);
        }
        return;
    }, [isAuto, setMin, setMinOffset, setMax, setMaxOffset]);

    return (
        <Group
            noWrap
            spacing="xs"
            align={setMinOffset && setMaxOffset ? 'baseline' : 'center'}
        >
            <Switch
                label={isAuto && label}
                checked={isAuto}
                onChange={(e) => {
                    toggleAuto((prev: boolean) => {
                        return !prev;
                    });

                    // When setting to manual, set the default offset to 0.5
                    if (!e.target.checked) {
                        setMinOffset?.(DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE);
                        setMaxOffset?.(DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE);
                    }

                    clearRange();
                    track({
                        name: EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED,
                        properties: {
                            custom_axis_range: isAuto,
                        },
                    });
                }}
            />
            {!isAuto && (
                <Group
                    spacing={isSettingOffset ? 'one' : 'xs'}
                    noWrap={!isSettingOffset}
                >
                    <Group spacing="xs" noWrap={!isSettingOffset}>
                        {!isSettingOffset && <Config.Label>Min</Config.Label>}
                        <TextInput
                            label={isSettingOffset ? 'Min' : undefined}
                            placeholder="Min"
                            defaultValue={min || undefined}
                            onBlur={(e) => setMin(e.currentTarget.value)}
                        />

                        {setMinOffset && (
                            <TextInput
                                label={
                                    <Group spacing="two">
                                        <Text>Offset</Text>
                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            label="Offset is a value that is added to the min value to determine the actual min value of the axis. For example, if the min value is 0 and the offset is 0.5, the actual min value will be -0.5."
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                placeholder="Offset"
                                defaultValue={minOffset || undefined}
                                onBlur={(e) =>
                                    setMinOffset(e.currentTarget.value)
                                }
                            />
                        )}
                    </Group>

                    <Group spacing="xs" noWrap={!isSettingOffset}>
                        {!isSettingOffset && <Config.Label>Max</Config.Label>}

                        <TextInput
                            label={isSettingOffset ? 'Max' : undefined}
                            placeholder="Max"
                            defaultValue={max || undefined}
                            onBlur={(e) => setMax(e.currentTarget.value)}
                        />

                        {setMaxOffset && (
                            <TextInput
                                label={
                                    <Group spacing="two">
                                        <Text>Offset</Text>
                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            label="Offset is a value that is added to the max value to determine the actual max value of the axis. For example, if the max value is 10 and the offset is 0.5, the actual max value will be 10.5."
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                placeholder="Offset"
                                defaultValue={maxOffset || undefined}
                                onBlur={(e) =>
                                    setMaxOffset(e.currentTarget.value)
                                }
                            />
                        )}
                    </Group>
                </Group>
            )}
        </Group>
    );
};
