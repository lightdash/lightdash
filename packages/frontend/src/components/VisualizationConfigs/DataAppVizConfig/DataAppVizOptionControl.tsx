import {
    ECHARTS_DEFAULT_COLORS,
    assertUnreachable,
    getEffectiveOptionValue,
    getGradientColor,
    type DataAppVizConfigOption,
    type DataAppVizGradientValue,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import isEqual from 'lodash/isEqual';
import { useState, type FC } from 'react';
import { NumberInput } from '../../common/NumberInput';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import GradientColorStops from '../common/GradientColorStops';
import RangeBoundInput from '../common/RangeBoundInput';

// Free-text and colour edits fire continuously while typing / dragging, so
// they're debounced before reaching chart state (and the iframe re-render).
const OPTION_DEBOUNCE_MS = 200;

type OptionOfType<T extends DataAppVizConfigOption['type']> = Extract<
    DataAppVizConfigOption,
    { type: T }
>;

/**
 * Holds the in-flight edit while the debounce is pending, then hands back to
 * the prop once it lands — the same `draft ?? value` discipline ColorSelector
 * uses, so an externally changed `value` is never masked by a stale draft.
 */
const usePendingEdit = <T extends DataAppVizOptionValue>(
    value: T,
    onChange: (value: T) => void,
) => {
    const [pending, setPending] = useState<T | null>(null);
    const flushChange = useDebouncedCallback(
        (next: T) => {
            onChange(next);
            setPending(null);
        },
        { delay: OPTION_DEBOUNCE_MS, flushOnUnmount: true },
    );

    return {
        current: pending ?? value,
        edit: (next: T) => {
            setPending(next);
            flushChange(next);
        },
        discard: () => {
            flushChange.cancel();
            setPending(null);
        },
    };
};

const BooleanOptionControl: FC<{
    option: OptionOfType<'boolean'>;
    value: boolean;
    onChange: (value: boolean) => void;
}> = ({ option, value, onChange }) => (
    <Config.Group>
        <Config.Label>{option.label}</Config.Label>
        <Switch
            size="xs"
            aria-label={option.label}
            checked={value}
            onChange={(event) => onChange(event.currentTarget.checked)}
        />
    </Config.Group>
);

const SelectOptionControl: FC<{
    option: OptionOfType<'select'>;
    value: string;
    onChange: (value: string) => void;
}> = ({ option, value, onChange }) => (
    <Select
        size="xs"
        label={option.label}
        data={option.choices}
        value={value}
        allowDeselect={false}
        onChange={(next) => onChange(next ?? option.default)}
    />
);

const NumberOptionControl: FC<{
    option: OptionOfType<'number'>;
    value: number;
    onChange: (value: number) => void;
}> = ({ option, value, onChange }) => (
    <NumberInput
        size="xs"
        label={option.label}
        value={value}
        min={option.min}
        max={option.max}
        decimalScale="unlimited"
        onNumberChange={(next) => onChange(next ?? option.default)}
    />
);

const TextOptionControl: FC<{
    option: OptionOfType<'text'>;
    value: string;
    onChange: (value: string) => void;
}> = ({ option, value, onChange }) => {
    const draft = usePendingEdit(value, onChange);
    return (
        <TextInput
            size="xs"
            label={option.label}
            value={draft.current}
            onChange={(event) => draft.edit(event.currentTarget.value)}
        />
    );
};

const ColorOptionControl: FC<{
    option: OptionOfType<'color'>;
    value: string;
    colorPalette: string[];
    onChange: (value: string) => void;
}> = ({ option, value, colorPalette, onChange }) => {
    const draft = usePendingEdit(value, onChange);
    return (
        <Config.Group>
            <Config.Label>{option.label}</Config.Label>
            <ColorSelector
                color={draft.current}
                swatches={
                    colorPalette.length > 0
                        ? colorPalette
                        : ECHARTS_DEFAULT_COLORS
                }
                ariaLabel={option.label}
                onColorChange={draft.edit}
            />
        </Config.Group>
    );
};

const GradientOptionControl: FC<{
    option: OptionOfType<'gradient'>;
    value: DataAppVizGradientValue;
    colorPalette: string[];
    onChange: (value: DataAppVizGradientValue) => void;
}> = ({ option, value, colorPalette, onChange }) => {
    const draft = usePendingEdit(value, onChange);
    // An inverted range is invalid, so it stays local until the bounds are fixed.
    const [invertedEdit, setInvertedEdit] = useState<{
        base: DataAppVizGradientValue;
        edit: DataAppVizGradientValue;
    } | null>(null);
    // An external change to the saved value supersedes the unsaved inverted edit.
    const isInverted =
        invertedEdit !== null && isEqual(invertedEdit.base, value);
    const gradient = isInverted ? invertedEdit.edit : draft.current;
    const edit = (next: DataAppVizGradientValue) => {
        if (next.min !== 'auto' && next.max !== 'auto' && next.min > next.max) {
            draft.discard();
            setInvertedEdit({ base: value, edit: next });
            return;
        }
        setInvertedEdit(null);
        draft.edit(next);
    };
    const setColors = (colors: string[]) => edit({ ...gradient, colors });
    return (
        <Stack gap="xs" role="group" aria-label={option.label}>
            <Config.Label>{option.label}</Config.Label>
            <GradientColorStops
                colors={gradient.colors}
                swatches={
                    colorPalette.length > 0
                        ? colorPalette
                        : ECHARTS_DEFAULT_COLORS
                }
                onColorChange={(index, color) =>
                    setColors(
                        gradient.colors.map((current, i) =>
                            i === index ? color : current,
                        ),
                    )
                }
                onAdd={() => {
                    const { colors } = gradient;
                    // The new stop starts halfway between the last two.
                    const middle =
                        getGradientColor(
                            { colors: colors.slice(-2), min: 0, max: 1 },
                            0.5,
                        ) ?? colors[colors.length - 1];
                    setColors([
                        ...colors.slice(0, -1),
                        middle,
                        ...colors.slice(-1),
                    ]);
                }}
                onRemove={(index) =>
                    setColors(gradient.colors.filter((_, i) => i !== index))
                }
            />
            {(['min', 'max'] as const).map((bound) => (
                <Group key={bound} gap="xs" wrap="nowrap" align="end">
                    <RangeBoundInput
                        bound={bound}
                        value={gradient[bound]}
                        autoLabel="Auto"
                        onChange={(next) =>
                            edit({ ...gradient, [bound]: next })
                        }
                    />
                </Group>
            ))}
            {isInverted && (
                <Text fz="xs" c="red" role="alert">
                    Min value must not be above max value
                </Text>
            )}
        </Stack>
    );
};

type Props = {
    option: DataAppVizConfigOption;
    /** Effective value: the stored value, or the declared default. */
    value: DataAppVizOptionValue;
    /** The resolved chart palette, including the current color scheme. */
    colorPalette?: string[];
    onChange: (value: DataAppVizOptionValue) => void;
};

/**
 * Renders one declared config option as a native control. Stored values come
 * from untyped JSONB, so the same resolver the host pushes into the iframe
 * decides what each control shows.
 */
const DataAppVizOptionControl: FC<Props> = ({
    option,
    value,
    colorPalette = [],
    onChange,
}) => {
    switch (option.type) {
        case 'boolean':
            return (
                <BooleanOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    onChange={onChange}
                />
            );
        case 'select':
            return (
                <SelectOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    onChange={onChange}
                />
            );
        case 'number':
            return (
                <NumberOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    onChange={onChange}
                />
            );
        case 'text':
            return (
                <TextOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    onChange={onChange}
                />
            );
        case 'color':
            return (
                <ColorOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    colorPalette={colorPalette}
                    onChange={onChange}
                />
            );
        case 'gradient':
            return (
                <GradientOptionControl
                    option={option}
                    value={getEffectiveOptionValue(option, value)}
                    colorPalette={colorPalette}
                    onChange={onChange}
                />
            );
        default:
            return assertUnreachable(
                option,
                'Unknown data app viz config option type',
            );
    }
};

export default DataAppVizOptionControl;
