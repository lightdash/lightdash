import {
    PieChartValueLabel,
    PieChartValueLabels,
    PieChartValueOptions,
} from '@lightdash/common';
import {
    ActionIcon,
    Collapse,
    ColorPicker,
    ColorSwatch,
    Group,
    Input,
    Popover,
    Select,
    Stack,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconHash } from '@tabler/icons-react';
import { FC } from 'react';
import { isHexCodeColor } from '../../utils/colorUtils';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

type ValueOptionsProps = {
    inputLabel: string;
    valueLabel: PieChartValueLabel;
    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    showValue: boolean;
    onToggleShowValue: (newValue: boolean) => void;
    showPercentage: boolean;
    onToggleShowPercentage: (newValue: boolean) => void;
};

const ValueOptions: FC<ValueOptionsProps> = ({
    inputLabel,
    valueLabel,
    showValue,
    showPercentage,
    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
}) => (
    <>
        <Select
            label={inputLabel}
            value={valueLabel}
            data={Object.entries(PieChartValueLabels).map(([value, label]) => ({
                value,
                label,
            }))}
            onChange={(newValueLabel: PieChartValueLabel) => {
                onValueLabelChange(newValueLabel);
            }}
        />

        <Tooltip
            position="top-start"
            disabled={valueLabel !== 'hidden'}
            label={`Enable ${inputLabel} to configure this option`}
        >
            <div>
                <Switch
                    disabled={valueLabel === 'hidden'}
                    checked={showValue}
                    onChange={(newValue) =>
                        onToggleShowValue(newValue.currentTarget.checked)
                    }
                    label="Show value"
                />
            </div>
        </Tooltip>

        <Tooltip
            position="top-start"
            disabled={valueLabel !== 'hidden'}
            label={`Enable ${inputLabel} to configure this option`}
        >
            <div>
                <Switch
                    disabled={valueLabel === 'hidden'}
                    checked={showPercentage}
                    onChange={(newValue) =>
                        onToggleShowPercentage(newValue.currentTarget.checked)
                    }
                    label="Show percentage"
                />
            </div>
        </Tooltip>
    </>
);

type GroupItemProps = {
    swatches: string[];
    defaultColor: string;
    color: string;
    defaultLabel: string;
    label: string;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;

    onColorChange: (newColor: string) => void;
    onLabelChange: (newLabel: string) => void;
    onValueOptionsChange: (newOptions: Partial<PieChartValueOptions>) => void;
};

const GroupItem: FC<GroupItemProps> = ({
    swatches,
    defaultLabel,
    label,
    defaultColor: _defaultColor,
    color,

    valueLabel,
    showValue,
    showPercentage,

    onColorChange,
    onLabelChange,
    onValueOptionsChange,
}) => {
    const isInvalidHexColor = !isHexCodeColor(color);
    const [opened, { toggle }] = useDisclosure();

    return (
        <Stack spacing="xs">
            <Group spacing="xs">
                <Input.Wrapper>
                    <Popover shadow="md" withArrow>
                        <Popover.Target>
                            <ColorSwatch
                                size={24}
                                color={color}
                                sx={{
                                    cursor: 'pointer',
                                    transition: 'opacity 100ms ease',
                                    '&:hover': { opacity: 0.8 },
                                }}
                            />
                        </Popover.Target>

                        <Popover.Dropdown p="xs">
                            <Stack spacing="xs">
                                <ColorPicker
                                    size="md"
                                    format="hex"
                                    swatches={swatches}
                                    swatchesPerRow={swatches.length}
                                    value={color}
                                    onChange={onColorChange}
                                />

                                <TextInput
                                    icon={<MantineIcon icon={IconHash} />}
                                    placeholder="Type in a custom HEX color"
                                    error={
                                        isInvalidHexColor
                                            ? 'Invalid HEX color'
                                            : null
                                    }
                                    value={(color ?? '').replace('#', '')}
                                    onChange={(event) => {
                                        const newColor =
                                            event.currentTarget.value;
                                        onColorChange(
                                            newColor === ''
                                                ? newColor
                                                : `#${newColor}`,
                                        );
                                    }}
                                />
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>
                </Input.Wrapper>

                <TextInput
                    sx={{ flexGrow: 1 }}
                    placeholder={defaultLabel}
                    value={label}
                    onChange={(event) => {
                        onLabelChange(event.currentTarget.value);
                    }}
                />

                <ActionIcon onClick={toggle} size="sm">
                    <MantineIcon
                        icon={opened ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>

            <Collapse in={opened}>
                <Stack pb="md" px="xxl">
                    <ValueOptions
                        inputLabel="Value label"
                        valueLabel={valueLabel}
                        onValueLabelChange={(newValue) =>
                            onValueOptionsChange({ valueLabel: newValue })
                        }
                        showValue={showValue}
                        onToggleShowValue={(newValue) =>
                            onValueOptionsChange({ showValue: newValue })
                        }
                        showPercentage={showPercentage}
                        onToggleShowPercentage={(newValue) =>
                            onValueOptionsChange({ showPercentage: newValue })
                        }
                    />
                </Stack>
            </Collapse>
        </Stack>
    );
};

const PieChartSeriesConfig: FC = () => {
    const {
        pieChartConfig: {
            defaultColors,
            valueLabel,
            valueLabelChange,
            showValue,
            toggleShowValue,
            showPercentage,
            toggleShowPercentage,
            groupLabels,
            groupLabelOverrides,
            groupLabelChange,
            groupColorOverrides,
            groupColorDefaults,
            groupColorChange,
            groupValueOptionOverrides,
            groupValueOptionChange,
        },
    } = useVisualizationContext();

    return (
        <Stack>
            <ValueOptions
                inputLabel="Value label"
                valueLabel={valueLabel}
                onValueLabelChange={valueLabelChange}
                showValue={showValue}
                onToggleShowValue={toggleShowValue}
                showPercentage={showPercentage}
                onToggleShowPercentage={toggleShowPercentage}
            />

            {groupLabels.length === 0 ? null : (
                <Stack
                    spacing="xs"
                    bg="gray.0"
                    p="sm"
                    sx={(theme) => ({ borderRadius: theme.radius.sm })}
                >
                    {groupLabels.map((groupLabel) => {
                        const color =
                            groupColorOverrides[groupLabel] ??
                            groupColorDefaults[groupLabel];

                        const valueOptions =
                            groupValueOptionOverrides[groupLabel];

                        return (
                            <GroupItem
                                key={groupLabel}
                                swatches={defaultColors}
                                defaultColor={groupColorDefaults[groupLabel]}
                                color={color}
                                defaultLabel={groupLabel}
                                label={groupLabelOverrides[groupLabel] ?? ''}
                                {...valueOptions}
                                onLabelChange={(newLabel) => {
                                    groupLabelChange(groupLabel, newLabel);
                                }}
                                onColorChange={(newColor) => {
                                    groupColorChange(groupLabel, newColor);
                                }}
                                onValueOptionsChange={(newValueLabel) => {
                                    groupValueOptionChange(
                                        groupLabel,
                                        newValueLabel,
                                    );
                                }}
                            />
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
};

export default PieChartSeriesConfig;
