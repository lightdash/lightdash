import { Group, Switch, TextInput } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useToggle } from 'react-use';
import { useTracking } from '../../../../providers/TrackingProvider';
import { EventName } from '../../../../types/Events';
import { Config } from '../../common/Config';

type Props = {
    label: string;
    min: string | undefined;
    max: string | undefined;
    setMin: (value: string | undefined) => void;
    setMax: (value: string | undefined) => void;
};

export const AxisMinMax: FC<Props> = ({ label, min, max, setMin, setMax }) => {
    const [isAuto, toggleAuto] = useToggle(!(min || max));
    const { track } = useTracking();

    const clearRange = useCallback(() => {
        if (!isAuto) {
            setMin(undefined);
            setMax(undefined);
        }
        return;
    }, [isAuto, setMin, setMax]);

    return (
        <Group noWrap spacing="xs">
            <Switch
                label={isAuto && label}
                checked={isAuto}
                onChange={() => {
                    toggleAuto((prev: boolean) => !prev);

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
                <Group noWrap spacing="xs">
                    <Config.Label>Min</Config.Label>
                    <TextInput
                        placeholder="Min"
                        defaultValue={min || undefined}
                        onBlur={(e) => setMin(e.currentTarget.value)}
                    />
                    <Config.Label>Max</Config.Label>
                    <TextInput
                        placeholder="Max"
                        defaultValue={max || undefined}
                        onBlur={(e) => setMax(e.currentTarget.value)}
                    />
                </Group>
            )}
        </Group>
    );
};
