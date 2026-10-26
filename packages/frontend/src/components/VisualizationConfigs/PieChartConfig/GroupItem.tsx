// TODO: Move to Series/ folder after refactor

import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    getReadableTextColor,
    type PieChartValueLabel,
    type PieChartValueOptions,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    type StackProps,
    ActionIcon,
    Tooltip,
} from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { forwardRef, useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';
import { GrabIcon } from '../common/GrabIcon';
import { ValueOptions } from './ValueOptions';

type GroupItemProps = {
    isOnlyItem: boolean;

    dragHandleProps?: DraggableProvidedDragHandleProps | null;

    defaultColor: string;
    defaultLabel: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;
    valueLabelColor?: string;
    defaultValueLabelColor?: string;

    granularityFields?: string[];

    onColorChange: (label: string, newColor: string) => void;
    onLabelChange: (label: string, newLabel: string) => void;
    onValueOptionsChange: (
        label: string,
        newOptions: Partial<PieChartValueOptions>,
    ) => void;
};

export const GroupItem = forwardRef<
    HTMLDivElement,
    StackProps & GroupItemProps
>(
    (
        {
            isOnlyItem,

            dragHandleProps,

            defaultLabel,
            defaultColor,

            swatches,

            label,
            color,

            valueLabel,
            showValue,
            showPercentage,
            valueLabelColor,
            defaultValueLabelColor,

            granularityFields,

            onColorChange,
            onLabelChange,
            onValueOptionsChange,

            ...rest
        },
        ref,
    ) => {
        const [opened, { toggle }] = useDisclosure();
        // Typing and colour picking are debounced before they reach the store;
        // the draft keeps the control responsive meanwhile.
        const [draftLabel, setDraftLabel] = useState(label ?? '');
        const [draftColor, setDraftColor] = useState<string | undefined>();
        const commitLabel = useDebouncedCallback(
            (value: string) => onLabelChange(defaultLabel, value), { delay: 500, flushOnUnmount: true });
        const commitColor = useDebouncedCallback((value: string) => {
            onColorChange(defaultLabel, value);
            setDraftColor(undefined);
        }, { delay: 500, flushOnUnmount: true });

        return (
            <Stack ref={ref} gap="xs" {...rest}>
                <Group gap="xs">
                    {!isOnlyItem && (
                        <GrabIcon dragHandleProps={dragHandleProps} />
                    )}

                    <ColorSelector
                        color={draftColor ?? color}
                        defaultColor={defaultColor}
                        swatches={swatches}
                        onColorChange={(newColor: string) => {
                            setDraftColor(newColor);
                            commitColor(newColor);
                        }}
                    />
                    <Box flex={1}>
                        <EditableText
                            placeholder={defaultLabel}
                            value={draftLabel}
                            granularityFields={granularityFields}
                            onChange={(event) => {
                                setDraftLabel(event.currentTarget.value);
                                commitLabel(event.currentTarget.value);
                            }}
                        />
                    </Box>

                    <Tooltip label="Override value label options">
                        <ActionIcon onClick={toggle}>
                            <MantineIcon
                                icon={opened ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Collapse expanded={opened}>
                    <Stack ml="xl" gap="xs" pb="xs">
                        <ValueOptions
                            valueLabel={valueLabel}
                            onValueLabelChange={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    valueLabel: newValue,
                                })
                            }
                            showValue={showValue}
                            onToggleShowValue={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showValue: newValue,
                                })
                            }
                            showPercentage={showPercentage}
                            onToggleShowPercentage={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showPercentage: newValue,
                                })
                            }
                            valueLabelColor={valueLabelColor}
                            defaultValueLabelColor={
                                defaultValueLabelColor ??
                                (valueLabel === 'inside' && color
                                    ? getReadableTextColor(color)
                                    : color)
                            }
                            swatches={swatches}
                            onValueLabelColorChange={(newColor) =>
                                onValueOptionsChange(defaultLabel, {
                                    valueLabelColor: newColor,
                                })
                            }
                        />
                    </Stack>
                </Collapse>
            </Stack>
        );
    },
);
