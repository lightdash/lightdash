import {
    Button,
    ColorInput,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useState, type FC } from 'react';
import {
    DEFAULT_FIELD_HEX,
    getStoredFieldColors,
    setFieldColors,
    type FieldColorOverrides,
} from '../../../theme/fieldColors';
import classes from './FieldColorsPopover.module.css';

const SWATCHES = [
    '#3b5bdb',
    '#de7f0b',
    '#7c3aed',
    '#3f3f46',
    '#0d9488',
    '#db2777',
    '#2f9e44',
    '#e03131',
];

const PRESETS: { label: string; colors: FieldColorOverrides }[] = [
    { label: 'Blue and orange', colors: { dimension: null, metric: null } },
    {
        label: 'Blue and purple',
        colors: { dimension: null, metric: '#7c3aed' },
    },
    {
        label: 'Gray and purple',
        colors: { dimension: '#3f3f46', metric: '#7c3aed' },
    },
    {
        label: 'Gray and orange',
        colors: { dimension: '#3f3f46', metric: null },
    },
];

/** Temporary playground for trying dimension and metric colors */
export const FieldColorsPopover: FC = () => {
    const [colors, setColors] = useState(getStoredFieldColors);
    const update = (next: FieldColorOverrides) => {
        setFieldColors(next);
        setColors(next);
    };

    return (
        <Popover position="bottom-start" width={260} shadow="md">
            <Popover.Target>
                <Tooltip label="Field colors" openDelay={400}>
                    <UnstyledButton
                        aria-label="Field colors"
                        className={classes.trigger}
                    >
                        <span data-kind="dimension" />
                        <span data-kind="metric" />
                    </UnstyledButton>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="sm">
                    <Text fz="sm" fw={600}>
                        Field colors
                    </Text>
                    <Group gap={6}>
                        {PRESETS.map((preset) => (
                            <Button
                                key={preset.label}
                                size="compact-xs"
                                variant="default"
                                onClick={() => update(preset.colors)}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </Group>
                    {(['dimension', 'metric'] as const).map((kind) => (
                        <ColorInput
                            key={kind}
                            size="xs"
                            label={
                                kind === 'dimension' ? 'Dimensions' : 'Metrics'
                            }
                            format="hex"
                            swatches={SWATCHES}
                            swatchesPerRow={8}
                            popoverProps={{ withinPortal: false }}
                            value={colors[kind] ?? DEFAULT_FIELD_HEX[kind]}
                            onChange={(hex) =>
                                update({ ...colors, [kind]: hex })
                            }
                        />
                    ))}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};
