import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Box,
    ColorSwatch,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './PalettePicker.module.css';

const INHERIT_VALUE = '__inherit__';
const SWATCH_LIMIT = 5;
const PREVIEW_BAR_HEIGHTS = [4, 7, 5, 9, 6];

type Props = {
    value: string | null;
    onChange: (value: string | null) => void;
    palettes: OrganizationColorPalette[];
    parentLabel: string;
    disabled?: boolean;
    label?: string;
    description?: string;
    placeholder?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    showPreview?: boolean;
};

type SwatchSet = {
    colors: string[];
    darkColors: string[] | null;
};

const SwatchInline: FC<{
    icon: typeof IconSun;
    label: string;
    colors: string[];
    limit: number;
}> = ({ icon, label, colors, limit }) => (
    <Tooltip label={label} position="top">
        <Group gap={2} wrap="nowrap">
            <MantineIcon icon={icon} size={14} color="gray" />
            <div className={classes.swatchStack}>
                {colors.slice(0, limit).map((color, index) => (
                    <ColorSwatch
                        key={`${color}-${index}`}
                        color={color}
                        withShadow={false}
                        className={classes.stackedSwatch}
                    />
                ))}
            </div>
        </Group>
    </Tooltip>
);

const PaletteOptionRow: FC<{ name: string; swatches: SwatchSet | null }> = ({
    name,
    swatches,
}) => (
    <Group gap="sm" wrap="nowrap" className={classes.row}>
        <Text size="xs" className={classes.name}>
            {name}
        </Text>
        {swatches && (
            <Group gap={4} wrap="nowrap" className={classes.swatches}>
                <SwatchInline
                    icon={IconSun}
                    label="Light mode"
                    colors={swatches.colors}
                    limit={SWATCH_LIMIT}
                />
                {swatches.darkColors && swatches.darkColors.length > 0 && (
                    <>
                        <Text size="xs" c="dimmed">
                            /
                        </Text>
                        <SwatchInline
                            icon={IconMoon}
                            label="Dark mode"
                            colors={swatches.darkColors}
                            limit={SWATCH_LIMIT}
                        />
                    </>
                )}
            </Group>
        )}
    </Group>
);

const MiniBarChart: FC<{ colors: string[] }> = ({ colors }) => (
    <Group
        gap={3}
        wrap="nowrap"
        align="flex-end"
        justify="center"
        className={classes.miniChart}
    >
        {colors.slice(0, SWATCH_LIMIT).map((color, i) => (
            <Box
                key={`${color}-${i}`}
                bg={color}
                h={`${(PREVIEW_BAR_HEIGHTS[i] ?? 5) * 10}%`}
                className={classes.miniChartBar}
            />
        ))}
    </Group>
);

const SelectedPalettePreview: FC<{ swatches: SwatchSet }> = ({ swatches }) => (
    <Group gap="xs" grow align="stretch" wrap="nowrap">
        <Tooltip label="Light mode" position="top">
            <Stack gap={4} className={classes.miniChartCardLight}>
                <Group gap={4} justify="center">
                    <MantineIcon icon={IconSun} size={12} color="gray" />
                </Group>
                <MiniBarChart colors={swatches.colors} />
            </Stack>
        </Tooltip>
        {swatches.darkColors && swatches.darkColors.length > 0 && (
            <Tooltip label="Dark mode" position="top">
                <Stack gap={4} className={classes.miniChartCardDark}>
                    <Group gap={4} justify="center">
                        <MantineIcon icon={IconMoon} size={12} color="dimmed" />
                    </Group>
                    <MiniBarChart colors={swatches.darkColors} />
                </Stack>
            </Tooltip>
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
    size = 'xs',
    showPreview = true,
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
                size={size}
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
                classNames={{
                    option: classes.option,
                    options: classes.options,
                }}
                renderOption={({ option }) => (
                    <PaletteOptionRow
                        name={option.label}
                        swatches={swatchesByValue.get(option.value) ?? null}
                    />
                )}
            />
            {showPreview && selectedSwatches && (
                <SelectedPalettePreview swatches={selectedSwatches} />
            )}
        </Stack>
    );
};
