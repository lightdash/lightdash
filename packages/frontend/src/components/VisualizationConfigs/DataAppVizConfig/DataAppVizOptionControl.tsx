import {
    assertUnreachable,
    getEffectiveOptionValue,
    type DataAppVizConfigOption,
    type DataAppVizOptionValue,
} from '@lightdash/common';
import { Select, Switch, TextInput } from '@mantine-8/core';
import { useDebouncedCallback } from '@mantine-8/hooks';
import { useState, type FC } from 'react';
import { NumberInput } from '../../common/NumberInput';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

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
    onChange: (value: string) => void;
}> = ({ option, value, onChange }) => {
    const draft = usePendingEdit(value, onChange);
    return (
        <Config.Group>
            <Config.Label>{option.label}</Config.Label>
            <ColorSelector
                color={draft.current}
                swatches={[]}
                ariaLabel={option.label}
                onColorChange={draft.edit}
            />
        </Config.Group>
    );
};

type Props = {
    option: DataAppVizConfigOption;
    /** Effective value: the stored value, or the declared default. */
    value: DataAppVizOptionValue;
    onChange: (value: DataAppVizOptionValue) => void;
};

/**
 * Renders one declared config option as a native control. Stored values come
 * from untyped JSONB, so the same resolver the host pushes into the iframe
 * decides what each control shows.
 */
const DataAppVizOptionControl: FC<Props> = ({ option, value, onChange }) => {
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
