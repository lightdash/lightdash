import { isHexCodeColor } from '@lightdash/common';
import {
    ColorSwatch,
    ColorPicker as MantineColorPicker,
    Popover,
    Stack,
    TextInput,
    type ColorSwatchProps,
} from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

interface Props {
    color?: string;
    defaultColor?: string;
    swatches: string[];
    onColorChange?: (newColor: string) => void;
    colorSwatchProps?: Omit<ColorSwatchProps, 'color'>;
    withAlpha?: boolean;
}

const ColorSelector: FC<Props> = ({
    color,
    defaultColor = 'rgba(0,0,0,.1)',
    swatches,
    onColorChange,
    colorSwatchProps,
    withAlpha = false,
}) => {
    const isValidHexColor = color && isHexCodeColor(color);

    return (
        <Popover withinPortal shadow="md" withArrow disabled={!onColorChange}>
            <Popover.Target>
                <ColorSwatch
                    size={20}
                    color={isValidHexColor ? color : defaultColor}
                    {...colorSwatchProps}
                    sx={{
                        cursor: onColorChange ? 'pointer' : 'default',
                        transition: 'opacity 100ms ease',
                        '&:hover': { opacity: 0.8 },
                        ...colorSwatchProps?.sx,
                    }}
                />
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Stack spacing="xs">
                    <MantineColorPicker
                        size="sm"
                        format={withAlpha ? 'hexa' : 'hex'}
                        swatches={swatches}
                        swatchesPerRow={8}
                        value={color ?? defaultColor}
                        onChange={(newColor) => {
                            if (!onColorChange) return;

                            // Only append alpha if the color has <1 opacity
                            if (withAlpha && newColor.endsWith('ff')) {
                                onColorChange(newColor.slice(0, 7));
                            } else {
                                onColorChange(newColor);
                            }
                        }}
                    />

                    <TextInput
                        size="xs"
                        icon={<MantineIcon icon={IconHash} />}
                        placeholder={`Type in a custom ${
                            withAlpha ? 'HEXA' : 'HEX'
                        }  color`}
                        error={
                            color && !isValidHexColor
                                ? `Invalid ${withAlpha ? 'HEXA' : 'HEX'} color`
                                : undefined
                        }
                        value={(color ?? '').replace('#', '')}
                        onChange={(event) => {
                            const newColor = event.currentTarget.value;
                            if (onColorChange) {
                                onColorChange(
                                    newColor === '' ? newColor : `#${newColor}`,
                                );
                            }
                        }}
                    />
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default ColorSelector;
