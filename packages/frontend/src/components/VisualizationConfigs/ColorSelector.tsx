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
import {
    useCallback,
    useState,
    type CSSProperties,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './ColorSelector.module.css';

const DEFAULT_PICKER_COLOR = '#000000';
const DEFAULT_PICKER_COLOR_WITH_ALPHA = '#000000ff';

const getPickerColor = (color: string, withAlpha: boolean) =>
    !withAlpha && color.length === 9 ? color.slice(0, 7) : color;

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
    const [isOpen, setIsOpen] = useState(false);
    const [draftColor, setDraftColor] = useState<string>();

    const isValidHexColor = color && isHexCodeColor(color);
    const currentInputColor = draftColor ?? color ?? '';
    const isValidDraftColor = draftColor && isHexCodeColor(draftColor);
    const isValidInputColor =
        currentInputColor && isHexCodeColor(currentInputColor);
    const isValidDefaultColor = isHexCodeColor(defaultColor);
    const isInteractive = Boolean(onColorChange) && !readOnly;
    const primarySwatchColor =
        isValidDraftColor && isInteractive
            ? draftColor
            : isValidHexColor
              ? color
              : defaultColor;
    const rawPickerColor = isValidDraftColor
        ? draftColor
        : isValidHexColor
          ? color
          : isValidDefaultColor
            ? defaultColor
            : (swatches.find(isHexCodeColor) ??
              (withAlpha
                  ? DEFAULT_PICKER_COLOR_WITH_ALPHA
                  : DEFAULT_PICKER_COLOR));
    const pickerColor = getPickerColor(rawPickerColor, withAlpha);
    const colorSwatchStyle =
        colorSwatchProps?.style &&
        !Array.isArray(colorSwatchProps.style) &&
        typeof colorSwatchProps.style === 'object'
            ? colorSwatchProps.style
            : {};
    const showGradient = !isInteractive && Boolean(secondaryColor);
    const gradientStyle = showGradient
        ? ({
              '--cs-gradient': `linear-gradient(135deg, ${primarySwatchColor} 0%, ${primarySwatchColor} 50%, ${secondaryColor} 50%, ${secondaryColor} 100%)`,
          } as CSSProperties)
        : undefined;
    const handleSwatchClick = useCallback(() => {
        setIsOpen((opened) => !opened);
    }, []);
    const handleSwatchKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;

            event.preventDefault();
            setIsOpen((opened) => !opened);
        },
        [],
    );

    return isInteractive ? (
        <Popover
            withinPortal
            shadow="md"
            withArrow
            opened={isOpen}
            onChange={(opened) => {
                setIsOpen(opened);
                setDraftColor(opened ? (color ?? '') : undefined);
            }}
        >
            <Popover.Target>
                <ColorSwatch
                    size={20}
                    color={primarySwatchColor}
                    {...colorSwatchProps}
                    role="button"
                    tabIndex={0}
                    aria-label="Select color"
                    onClick={handleSwatchClick}
                    onKeyDown={handleSwatchKeyDown}
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
                        value={pickerColor}
                        onChange={(newColor) => {
                            if (!onColorChange) return;

                            setDraftColor(newColor);
                            onColorChange(newColor);
                        }}
                    />

                    <TextInput
                        size="xs"
                        leftSection={<MantineIcon icon={IconHash} />}
                        placeholder={`Type in a custom ${
                            withAlpha ? 'HEXA' : 'HEX'
                        }  color`}
                        error={
                            currentInputColor && !isValidInputColor
                                ? `Invalid ${withAlpha ? 'HEXA' : 'HEX'} color`
                                : undefined
                        }
                        value={currentInputColor.replace('#', '')}
                        onChange={(event) => {
                            const newColor = event.currentTarget.value;
                            const nextColor =
                                newColor === '' ? '' : `#${newColor}`;
                            setDraftColor(nextColor);

                            if (onColorChange && isHexCodeColor(nextColor)) {
                                onColorChange(nextColor);
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
                ...colorSwatchStyle,
            }}
        />
    );
};

export default ColorSelector;
