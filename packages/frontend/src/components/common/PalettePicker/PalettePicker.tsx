import { type OrganizationColorPalette } from '@lightdash/common';
import {
    ColorSwatch,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './PalettePicker.module.css';

const INHERIT_VALUE = '__inherit__';
const DROPDOWN_SWATCH_LIMIT = 5;

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

const SwatchInline: FC<{
    icon: typeof IconSun;
    label: string;
    colors: string[];
    limit?: number;
    swatchSize?: number;
    wrap?: boolean;
}> = ({ icon, label, colors, limit, swatchSize = 12, wrap = false }) => {
    const visible = limit ? colors.slice(0, limit) : colors;
    return (
        <Tooltip label={label} position="top" withinPortal>
            <Group
                gap={4}
                wrap={wrap ? 'wrap' : 'nowrap'}
                className={wrap ? classes.previewRow : undefined}
            >
                <MantineIcon icon={icon} size={14} color="gray" />
                {visible.map((color, index) => (
                    <ColorSwatch
                        key={`${color}-${index}`}
                        size={swatchSize}
                        color={color}
                        withShadow={false}
                    />
                ))}
            </Group>
        </Tooltip>
    );
};

const PaletteOptionRow: FC<{ name: string; swatches: SwatchSet | null }> = ({
    name,
    swatches,
}) => (
    <Group gap="sm" wrap="nowrap" className={classes.row}>
        <Text className={classes.name}>{name}</Text>
        {swatches && (
            <Group gap="xs" wrap="nowrap" className={classes.swatches}>
                <SwatchInline
                    icon={IconSun}
                    label="Light mode"
                    colors={swatches.colors}
                    limit={DROPDOWN_SWATCH_LIMIT}
                />
                {swatches.darkColors && swatches.darkColors.length > 0 && (
                    <>
                        <Text c="ldGray.3">/</Text>
                        <SwatchInline
                            icon={IconMoon}
                            label="Dark mode"
                            colors={swatches.darkColors}
                            limit={DROPDOWN_SWATCH_LIMIT}
                        />
                    </>
                )}
            </Group>
        )}
    </Group>
);

const SelectedPalettePreview: FC<{ swatches: SwatchSet }> = ({ swatches }) => (
    <Stack gap="xs" className={classes.preview}>
        <SwatchInline
            icon={IconSun}
            label="Light mode"
            colors={swatches.colors}
            swatchSize={16}
            wrap
        />
        {swatches.darkColors && swatches.darkColors.length > 0 && (
            <SwatchInline
                icon={IconMoon}
                label="Dark mode"
                colors={swatches.darkColors}
                swatchSize={16}
                wrap
            />
        )}
    </Stack>
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

    const selectedSwatches = value
        ? (swatchesByValue.get(value) ?? null)
        : null;

    return (
        <Stack gap="sm">
            <Select
                size="xs"
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
            {selectedSwatches && (
                <SelectedPalettePreview swatches={selectedSwatches} />
            )}
        </Stack>
    );
};
