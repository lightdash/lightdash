import {
    getEffectiveOptionValues,
    type DataAppVizField,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { Config } from '../common/Config';
import DataAppVizOptionControl from './DataAppVizOptionControl';

type Props = {
    /** A declared input with `configOptions`. */
    field: DataAppVizField;
    /** The option `group` to render; null for ungrouped options. */
    group: string | null;
    /** The query fields bound to it, in selection order. */
    fieldIds: string[];
    getFieldLabel: (fieldId: string) => string;
    /** Stored values for this input's fields, keyed by field id. */
    values: Record<string, DataAppVizOptionValues>;
    colorPalette: string[];
    onChange: (
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
};

/** One group of an input's declared options, once per bound field, under its name. */
const DataAppVizFieldOptions: FC<Props> = ({
    field,
    group,
    fieldIds,
    getFieldLabel,
    values,
    colorPalette,
    onChange,
}) => {
    const configOptions = (field.configOptions ?? []).filter(
        (option) => (option.group ?? null) === group,
    );
    if (configOptions.length === 0 || fieldIds.length === 0) return null;
    return (
        <Stack gap="sm">
            {fieldIds.map((fieldId) => {
                const label = getFieldLabel(fieldId);
                const effective = getEffectiveOptionValues(
                    configOptions,
                    values[fieldId] ?? {},
                );
                return (
                    <Stack
                        key={fieldId}
                        gap="xs"
                        role="group"
                        aria-label={`${label} options`}
                    >
                        <Config.Label>{label}</Config.Label>
                        {configOptions.map((option) => (
                            <DataAppVizOptionControl
                                key={option.name}
                                option={option}
                                value={effective[option.name]}
                                colorPalette={colorPalette}
                                onChange={(value) =>
                                    onChange(fieldId, option.name, value)
                                }
                            />
                        ))}
                    </Stack>
                );
            })}
        </Stack>
    );
};

export default DataAppVizFieldOptions;
