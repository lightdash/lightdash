import { isHexCodeColor } from '@lightdash/common';
import {
    ColorSwatch,
    ColorPicker as MantineColorPicker,
    Popover,
    Stack,
    TextInput,
    type ColorSwatchProps,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { IconHash } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './ColorSelector.module.css';

interface Props {
    color?: string;
    defaultColor?: string;
    secondaryColor?: string;
    swatches: string[];
    onColorChange?: (newColor: string) => void;
    readOnly?: boolean;
    colorSwatchProps?: Omit<ColorSwatchProps, 'color'>;
    withAlpha?: boolean;
}

const ColorSelector: FC<Props> = ({
    color,
    defaultColor = 'rgba(0,0,0,.1)',
    secondaryColor,
    swatches,
    onColorChange,
    readOnly = false,
    colorSwatchProps,
    withAlpha = false,
}) => {
    const isValidHexColor = color && isHexCodeColor(color);
    const isInteractive = Boolean(onColorChange) && !readOnly;
    const primarySwatchColor = isValidHexColor ? color : defaultColor;
    const showGradient = !isInteractive && Boolean(secondaryColor);
    const gradientStyle = showGradient
        ? ({
              '--cs-gradient': `linear-gradient(135deg, ${primarySwatchColor} 0%, ${primarySwatchColor} 50%, ${secondaryColor} 50%, ${secondaryColor} 100%)`,
          } as CSSProperties)
        : undefined;

    return isInteractive ? (
        <Popover withinPortal shadow="md" withArrow>
            <Popover.Target>
                <ColorSwatch
                    size={20}
                    color={isValidHexColor ? color : defaultColor}
                    {...colorSwatchProps}
                    className={clsx(
                        classes.swatchInteractive,
                        colorSwatchProps?.className,
                    )}
                />
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Stack gap="xs">
                    <MantineColorPicker
                        size="sm"
                        format={withAlpha ? 'hexa' : 'hex'}
                        swatches={swatches}
                        swatchesPerRow={8}
                        value={color ?? defaultColor}
                        onChange={(newColor) => {
                            if (!onColorChange) return;

                            if (withAlpha && newColor.endsWith('ff')) {
                                onColorChange(newColor.slice(0, 7));
                            } else {
                                onColorChange(newColor);
                            }
                        }}
                    />

                    <TextInput
                        size="xs"
                        leftSection={<MantineIcon icon={IconHash} />}
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
    ) : (
        <ColorSwatch
            size={20}
            color={primarySwatchColor}
            {...colorSwatchProps}
            className={clsx(classes.swatchStatic, colorSwatchProps?.className)}
            classNames={
                showGradient
                    ? { colorOverlay: classes.colorOverlayGradient }
                    : undefined
            }
            style={{
                ...gradientStyle,
                ...(typeof colorSwatchProps?.style === 'object' &&
                colorSwatchProps?.style !== null
                    ? colorSwatchProps.style
                    : {}),
            }}
        />
    );
};

export default ColorSelector;
