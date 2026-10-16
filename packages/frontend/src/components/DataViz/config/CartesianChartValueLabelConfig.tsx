import {
    assertUnreachable,
    ValueLabelPositionOptions,
} from '@lightdash/common';
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
import { type TFunction } from 'i18next';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const getValueLabelPositionLabel = (
    t: TFunction,
    position: ValueLabelPositionOptions,
): string => {
    switch (position) {
        case ValueLabelPositionOptions.HIDDEN:
            return t('cartesian.valueLabel.hidden');
        case ValueLabelPositionOptions.TOP:
            return t('cartesian.valueLabel.top');
        case ValueLabelPositionOptions.BOTTOM:
            return t('cartesian.valueLabel.bottom');
        case ValueLabelPositionOptions.LEFT:
            return t('cartesian.valueLabel.left');
        case ValueLabelPositionOptions.RIGHT:
            return t('cartesian.valueLabel.right');
        case ValueLabelPositionOptions.INSIDE:
            return t('cartesian.valueLabel.inside');
        default:
            return assertUnreachable(position, 'Unknown value label position');
    }
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
        label: string;
        selected: boolean;
    }
>(({ value, label, selected: _selected, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
            <ValueLabelIcon position={value} />
            <Text>{label}</Text>
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
    const { t } = useTranslation('dataViz');
    return (
        <Group gap="xs" wrap="nowrap">
            <Select
                allowDeselect={false}
                data={Object.values(ValueLabelPositionOptions).map(
                    (option) => ({
                        value: option,
                        label: getValueLabelPositionLabel(t, option),
                    }),
                )}
                renderOption={({ option, checked }) => (
                    <ValueLabelItem
                        value={option.value as ValueLabelPositionOptions}
                        label={option.label}
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
                    ariaLabel={t('cartesian.valueLabel.selectColor')}
                    onColorChange={onChangeValueLabelColor}
                    onColorReset={
                        valueLabelColor
                            ? () => onChangeValueLabelColor(undefined)
                            : undefined
                    }
                    resetLabel={t('cartesian.valueLabel.useAutomaticColor')}
                />
            )}
        </Group>
    );
};
