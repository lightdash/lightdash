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
import { useMemo, type FC } from 'react';
import EChartsReact, { type EChartsOption } from '../../EChartsReactWrapper';
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
    <Tooltip label={label} position="top" withinPortal>
        <Group gap={4} wrap="nowrap">
            <MantineIcon icon={icon} size={14} color="gray" />
            {colors.slice(0, limit).map((color, index) => (
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
        <Text size="xs" className={classes.name}>
            {name}
        </Text>
        {swatches && (
            <Group gap="xs" wrap="nowrap" className={classes.swatches}>
                <SwatchInline
                    icon={IconSun}
                    label="Light mode"
                    colors={swatches.colors}
                    limit={SWATCH_LIMIT}
                />
                {swatches.darkColors && swatches.darkColors.length > 0 && (
                    <>
                        <Text size="xs" c="ldGray.3">
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

const MiniBarChart: FC<{ colors: string[]; theme: 'light' | 'dark' }> = ({
    colors,
    theme,
}) => {
    const option = useMemo<EChartsOption>(() => {
        const visible = colors.slice(0, SWATCH_LIMIT);
        return {
            animation: false,
            grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: false },
            xAxis: { type: 'category', data: [''], show: false },
            yAxis: { type: 'value', show: false, max: 10 },
            series: visible.map((color, i) => ({
                type: 'bar',
                data: [PREVIEW_BAR_HEIGHTS[i] ?? 5],
                itemStyle: { color, borderRadius: [2, 2, 0, 0] },
                barWidth: 10,
                cursor: 'default',
                silent: true,
            })),
        };
    }, [colors]);

    return (
        <div
            className={
                theme === 'dark'
                    ? classes.miniChartDark
                    : classes.miniChartLight
            }
        >
            <EChartsReact
                option={option}
                style={{ height: 60, width: '100%' }}
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
};

const SelectedPalettePreview: FC<{ swatches: SwatchSet }> = ({ swatches }) => (
    <Group gap="xs" grow align="stretch" wrap="nowrap">
        <Tooltip label="Light mode" position="top" withinPortal>
            <Stack gap={4} className={classes.miniChartCardLight}>
                <Group gap={4} justify="center">
                    <MantineIcon icon={IconSun} size={12} color="gray" />
                </Group>
                <MiniBarChart colors={swatches.colors} theme="light" />
            </Stack>
        </Tooltip>
        {swatches.darkColors && swatches.darkColors.length > 0 && (
            <Tooltip label="Dark mode" position="top" withinPortal>
                <Stack gap={4} className={classes.miniChartCardDark}>
                    <Group gap={4} justify="center">
                        <MantineIcon icon={IconMoon} size={12} color="dimmed" />
                    </Group>
                    <MiniBarChart colors={swatches.darkColors} theme="dark" />
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
