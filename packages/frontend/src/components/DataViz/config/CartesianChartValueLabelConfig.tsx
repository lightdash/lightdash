import { ValueLabelPositionOptions } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Group,
    Popover,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconArrowUp,
    IconClearAll,
    IconEyeOff,
    IconLayoutAlignCenter,
    IconSettings,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
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

    return (
        <MantineIcon color={position ? 'ldDark.8' : 'ldGray.4'} icon={icon} />
    );
};

type Props = {
    valueLabelPosition: ValueLabelPositionOptions | undefined;
    showValue?: boolean;
    showLabel?: boolean;
    showSeriesName?: boolean;
    onChangeValueLabelPosition: (value: ValueLabelPositionOptions) => void;
    onChangeShowValue?: (value: boolean) => void;
    onChangeShowLabel?: (value: boolean) => void;
    onChangeShowSeriesName?: (value: boolean) => void;
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
    showValue = true,
    showLabel = false,
    showSeriesName = false,
    onChangeShowValue,
    onChangeShowLabel,
    onChangeShowSeriesName,
}) => {
    const isVisible =
        valueLabelPosition &&
        valueLabelPosition !== ValueLabelPositionOptions.HIDDEN;

    const popoverTarget = isVisible && onChangeShowValue && (
        <Popover position="bottom-end" shadow="md" withinPortal>
            <Popover.Target>
                <ActionIcon variant="subtle" size="xs">
                    <MantineIcon icon={IconSettings} color="ldGray.6" />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack spacing="xs">
                    <Checkbox
                        size="xs"
                        checked={showValue}
                        onChange={(e) =>
                            onChangeShowValue(e.currentTarget.checked)
                        }
                        label="Show value"
                    />
                    {onChangeShowLabel && (
                        <Checkbox
                            size="xs"
                            checked={showLabel}
                            onChange={(e) =>
                                onChangeShowLabel(e.currentTarget.checked)
                            }
                            label="Show label"
                        />
                    )}
                    {onChangeShowSeriesName && (
                        <Checkbox
                            size="xs"
                            checked={showSeriesName}
                            onChange={(e) =>
                                onChangeShowSeriesName(
                                    e.currentTarget.checked,
                                )
                            }
                            label="Show metric name"
                        />
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );

    return (
        <Select
            radius="md"
            data={Object.values(ValueLabelPositionOptions).map((option) => ({
                value: option,
                label: capitalize(option),
            }))}
            itemComponent={ValueLabelItem}
            icon={<ValueLabelIcon position={valueLabelPosition} />}
            rightSection={popoverTarget || undefined}
            rightSectionProps={{ style: { pointerEvents: 'all' } }}
            value={valueLabelPosition}
            onChange={(value) =>
                value &&
                onChangeValueLabelPosition(
                    value as ValueLabelPositionOptions,
                )
            }
            styles={(theme) => ({
                root: {
                    flex: 1,
                },
                input: {
                    fontWeight: 500,
                    borderColor: theme.colors.ldGray[2],
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.ldGray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.ldGray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.ldGray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.ldGray[1],
                    },
                },
            })}
        />
    );
};
