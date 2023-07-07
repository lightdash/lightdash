import { PieChartValueLabel, PieChartValueLabels } from '@lightdash/common';
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

type LabelOptionsProps = {
    inputLabel: string;
    valueLabel: PieChartValueLabel;
    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    showValue: boolean;
    onToggleShowValue: () => void;
    showPercentage: boolean;
    onToggleShowPercentage: () => void;
};

const LabelOptions: FC<LabelOptionsProps> = ({
    inputLabel,
    valueLabel,
    showValue,
    showPercentage,
    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
}) => {
    return (
        <>
            <Select
                label={inputLabel}
                value={valueLabel}
                data={Object.entries(PieChartValueLabels).map(
                    ([value, label]) => ({
                        value,
                        label,
                    }),
                )}
                onChange={(newValueLabel: PieChartValueLabel) => {
                    onValueLabelChange(newValueLabel);
                }}
            />

            <Tooltip
                position="top-start"
                disabled={valueLabel !== 'hidden'}
                label="Enable value labels to configure this option"
            >
                <div>
                    <Switch
                        disabled={valueLabel === 'hidden'}
                        checked={showValue}
                        onChange={onToggleShowValue}
                        label="Show value"
                    />
                </div>
            </Tooltip>

            <Tooltip
                position="top-start"
                disabled={valueLabel !== 'hidden'}
                label="Enable value labels to configure this option"
            >
                <div>
                    <Switch
                        disabled={valueLabel === 'hidden'}
                        checked={showPercentage}
                        onChange={onToggleShowPercentage}
                        label="Show percentage"
                    />
                </div>
            </Tooltip>
        </>
    );
};

type GroupItemProps = {
    defaultLabel: string;
    label: string;
    defaultColor: string;
    color: string;
    swatches: string[];
    onColorChange: (newColor: string) => void;
    onLabelChange: (newLabel: string) => void;
};

const GroupItem: FC<GroupItemProps> = ({
    swatches,
    defaultLabel,
    label,
    // defaultColor,
    color,
    onColorChange,
    onLabelChange,
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
                    <LabelOptions
                        inputLabel="Value label"
                        valueLabel="hidden"
                        onValueLabelChange={() => {}}
                        showValue={false}
                        onToggleShowValue={() => {}}
                        showPercentage={false}
                        onToggleShowPercentage={() => {}}
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
        },
    } = useVisualizationContext();

    return (
        <Stack>
            <LabelOptions
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

                        return (
                            <GroupItem
                                key={groupLabel}
                                defaultColor={groupColorDefaults[groupLabel]}
                                defaultLabel={groupLabel}
                                label={groupLabelOverrides[groupLabel] ?? ''}
                                color={color}
                                swatches={defaultColors}
                                onLabelChange={(newLabel) => {
                                    groupLabelChange(groupLabel, newLabel);
                                }}
                                onColorChange={(newColor) => {
                                    groupColorChange(groupLabel, newColor);
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
