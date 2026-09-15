import { ValueLabelPositionOptions } from '@lightdash/common';
import { Box, Group, Text, Select } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconArrowUp,
    IconClearAll,
    IconEyeOff,
    IconLayoutAlignCenter,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import classes from './SelectConfig.module.css';

const ValueLabelIcon: FC<{
    position: ValueLabelPositionOptions | undefined;
}> = ({ position }) => {
    let icon;
    switch (position) {
        case ValueLabelPositionOptions.HIDDEN:
            icon = IconEyeOff;
            break;
        case ValueLabelPositionOptions.TOP:
            icon = IconArrowUp;
            break;
        case ValueLabelPositionOptions.BOTTOM:
            icon = IconArrowDown;
            break;
        case ValueLabelPositionOptions.LEFT:
            icon = IconArrowLeft;
            break;
        case ValueLabelPositionOptions.RIGHT:
            icon = IconArrowRight;
            break;
        case ValueLabelPositionOptions.INSIDE:
            icon = IconLayoutAlignCenter;
            break;
        default:
            icon = IconClearAll;
    }

    return (
        <MantineIcon color={position ? 'ldDark.8' : 'ldGray.4'} icon={icon} />
    );
};

type Props = {
    valueLabelPosition: ValueLabelPositionOptions | undefined;
    valueLabelColor?: string;
    defaultColor: string;
    colors: string[];
    onChangeValueLabelPosition: (value: ValueLabelPositionOptions) => void;
    onChangeValueLabelColor: (value: string | undefined) => void;
};

const ValueLabelItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: ValueLabelPositionOptions;
        selected: boolean;
    }
>(({ value, selected: _selected, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
            <ValueLabelIcon position={value} />
            <Text>{capitalize(value)}</Text>
        </Group>
    </Box>
));

export const CartesianChartValueLabelConfig: FC<Props> = ({
    onChangeValueLabelPosition,
    onChangeValueLabelColor,
    valueLabelPosition,
    valueLabelColor,
    defaultColor,
    colors,
}) => {
    return (
        <Group gap="xs" wrap="nowrap">
            <Select
                allowDeselect={false}
                data={Object.values(ValueLabelPositionOptions).map(
                    (option) => ({
                        value: option,
                        label: capitalize(option),
                    }),
                )}
                renderOption={({ option, checked }) => (
                    <ValueLabelItem
                        value={option.value as ValueLabelPositionOptions}
                        selected={checked ?? false}
                    />
                )}
                leftSection={<ValueLabelIcon position={valueLabelPosition} />}
                value={valueLabelPosition}
                onChange={(value) =>
                    value &&
                    onChangeValueLabelPosition(
                        value as ValueLabelPositionOptions,
                    )
                }
                classNames={classes}
            />
            {valueLabelPosition !== ValueLabelPositionOptions.HIDDEN && (
                <ColorSelector
                    color={valueLabelColor}
                    defaultColor={defaultColor}
                    swatches={colors}
                    withAlpha
                    ariaLabel="Select value label color"
                    onColorChange={onChangeValueLabelColor}
                    onColorReset={
                        valueLabelColor
                            ? () => onChangeValueLabelColor(undefined)
                            : undefined
                    }
                    resetLabel="Use automatic color"
                />
            )}
        </Group>
    );
};
