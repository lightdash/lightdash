import { type OrganizationColorPalette } from '@lightdash/common';
import { ColorSwatch, Group, Select, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './PalettePicker.module.css';

const INHERIT_VALUE = '__inherit__';

type Props = {
    value: string | null;
    onChange: (value: string | null) => void;
    palettes: OrganizationColorPalette[];
    parentLabel: string;
    disabled?: boolean;
    label?: string;
    description?: string;
    placeholder?: string;
};

const PaletteOptionRow: FC<{ name: string; colors: string[] | null }> = ({
    name,
    colors,
}) => (
    <Group gap="xs" wrap="nowrap" className={classes.row}>
        <Text className={classes.name}>{name}</Text>
        {colors && colors.length > 0 && (
            <Group gap={2} wrap="nowrap" className={classes.swatches}>
                {colors.slice(0, 8).map((color, index) => (
                    <ColorSwatch
                        key={`${color}-${index}`}
                        size={14}
                        color={color}
                        withShadow={false}
                    />
                ))}
            </Group>
        )}
    </Group>
);

export const PalettePicker: FC<Props> = ({
    value,
    onChange,
    palettes,
    parentLabel,
    disabled,
    label,
    description,
    placeholder,
}) => {
    const data = [
        { value: INHERIT_VALUE, label: `Inherit from ${parentLabel}` },
        ...palettes.map((palette) => ({
            value: palette.colorPaletteUuid,
            label: palette.name,
        })),
    ];

    const swatchesByValue = new Map<string, string[]>(
        palettes.map((palette) => [palette.colorPaletteUuid, palette.colors]),
    );

    return (
        <Select
            label={label}
            description={description}
            placeholder={placeholder}
            data={data}
            value={value ?? INHERIT_VALUE}
            onChange={(next) =>
                onChange(next && next !== INHERIT_VALUE ? next : null)
            }
            disabled={disabled}
            allowDeselect={false}
            renderOption={({ option }) => (
                <PaletteOptionRow
                    name={option.label}
                    colors={swatchesByValue.get(option.value) ?? null}
                />
            )}
        />
    );
};
