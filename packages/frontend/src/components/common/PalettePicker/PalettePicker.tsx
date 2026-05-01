import { type OrganizationColorPalette } from '@lightdash/common';
import { ColorSwatch, Group, Select, Text, Tooltip } from '@mantine-8/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './PalettePicker.module.css';

const INHERIT_VALUE = '__inherit__';
const SWATCH_LIMIT = 5;

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

type SwatchSet = {
    colors: string[];
    darkColors: string[] | null;
};

const SwatchRow: FC<{
    icon: typeof IconSun;
    label: string;
    colors: string[];
}> = ({ icon, label, colors }) => (
    <Tooltip label={label} position="top" withinPortal>
        <Group gap={4} wrap="nowrap">
            <MantineIcon icon={icon} size="sm" color="gray" />
            {colors.slice(0, SWATCH_LIMIT).map((color, index) => (
                <ColorSwatch
                    key={`${color}-${index}`}
                    size={12}
                    color={color}
                    withShadow={false}
                />
            ))}
        </Group>
    </Tooltip>
);

const PaletteOptionRow: FC<{ name: string; swatches: SwatchSet | null }> = ({
    name,
    swatches,
}) => (
    <Group gap="sm" wrap="nowrap" className={classes.row}>
        <Text className={classes.name}>{name}</Text>
        {swatches && (
            <Group gap="xs" wrap="nowrap" className={classes.swatches}>
                <SwatchRow
                    icon={IconSun}
                    label="Light mode"
                    colors={swatches.colors}
                />
                {swatches.darkColors && swatches.darkColors.length > 0 && (
                    <>
                        <Text c="ldGray.3">/</Text>
                        <SwatchRow
                            icon={IconMoon}
                            label="Dark mode"
                            colors={swatches.darkColors}
                        />
                    </>
                )}
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

    const swatchesByValue = new Map<string, SwatchSet>(
        palettes.map((palette) => [
            palette.colorPaletteUuid,
            { colors: palette.colors, darkColors: palette.darkColors },
        ]),
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
                    swatches={swatchesByValue.get(option.value) ?? null}
                />
            )}
        />
    );
};
