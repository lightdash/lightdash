import { ValueLabelPositionOptions } from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconArrowUp,
    IconClearAll,
    IconEyeOff,
    IconLayoutAlignCenter,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

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

    return <MantineIcon color={position ? 'indigo.4' : 'gray.4'} icon={icon} />;
};

type Props = {
    valueLabelPosition: ValueLabelPositionOptions | undefined;
    onChangeValueLabelPosition: (value: ValueLabelPositionOptions) => void;
};

const ValueLabelItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: ValueLabelPositionOptions;
        selected: boolean;
    }
>(({ value, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap spacing="xs">
            <ValueLabelIcon position={value} />
            <Text>{capitalize(value)}</Text>
        </Group>
    </Box>
));

export const CartesianChartValueLabelConfig: FC<Props> = ({
    onChangeValueLabelPosition,
    valueLabelPosition,
}) => {
    return (
        <Select
            radius="md"
            data={Object.values(ValueLabelPositionOptions).map((option) => ({
                value: option,
                label: capitalize(option),
            }))}
            itemComponent={ValueLabelItem}
            icon={<ValueLabelIcon position={valueLabelPosition} />}
            value={valueLabelPosition}
            onChange={(value) =>
                value &&
                onChangeValueLabelPosition(value as ValueLabelPositionOptions)
            }
            styles={(theme) => ({
                input: {
                    width: '110px',
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.gray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.gray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.gray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
            })}
        />
    );
};
