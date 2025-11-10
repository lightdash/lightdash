// TODO: This could be combined with the pie chart or cartesian
// chart series configs if they have more similar options in the future.

import { Box, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';

type StepConfigProps = {
    defaultColor: string;
    defaultLabel: string;
    id?: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    onColorChange: (id: string, newColor: string) => void;
    onLabelChange: (id: string, newLabel: string) => void;
};

export const StepConfig: FC<StepConfigProps> = ({
    defaultColor,
    defaultLabel,
    id,
    swatches,
    color,
    label,
    onColorChange,
    onLabelChange,
    ...rest
}) => {
    const stepId = id ?? defaultLabel;
    return (
        <Stack spacing="xs" {...rest}>
            <Group spacing="xs">
                <ColorSelector
                    color={color}
                    defaultColor={defaultColor}
                    swatches={swatches}
                    onColorChange={(newColor: string) =>
                        onColorChange(stepId, newColor)
                    }
                />
                <Box style={{ flexGrow: 1 }}>
                    <EditableText
                        placeholder={defaultLabel}
                        value={label}
                        onChange={(event) => {
                            onLabelChange(stepId, event.currentTarget.value);
                        }}
                    />
                </Box>
            </Group>
        </Stack>
    );
};
