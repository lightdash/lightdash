import { Group, Switch, TextInput } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useToggle } from 'react-use';
import { useTracking } from '../../../../providers/TrackingProvider';
import { EventName } from '../../../../types/Events';

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
    const [isAuto, toggleAuto] = useToggle(
        // Fix this issue; it's set as true by default because of the offsets
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
        <Group noWrap spacing="xs" align="baseline">
            <Switch
                label={isAuto && label}
                checked={isAuto}
                onChange={(e) => {
                    toggleAuto((prev: boolean) => {
                        return !prev;
                    });

                    // When setting to manual, set the default offset to 0.5
                    if (!e.target.checked) {
                        setMinOffset?.('0.5');
                        setMaxOffset?.('0.5');
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
                <Group spacing="one">
                    <Group spacing="xs" noWrap>
                        <TextInput
                            label="Min"
                            placeholder="Min"
                            defaultValue={min || undefined}
                            onBlur={(e) => setMin(e.currentTarget.value)}
                        />

                        {setMinOffset && (
                            <TextInput
                                label="Offset"
                                placeholder="Offset"
                                defaultValue={minOffset || undefined}
                                onBlur={(e) =>
                                    setMinOffset(e.currentTarget.value)
                                }
                            />
                        )}
                    </Group>

                    <Group spacing="xs" noWrap>
                        <TextInput
                            label="Max"
                            placeholder="Max"
                            defaultValue={max || undefined}
                            onBlur={(e) => setMax(e.currentTarget.value)}
                        />

                        {setMaxOffset && (
                            <TextInput
                                label="Offset"
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
