// TODO: This could be combined with the pie chart or cartesian
// chart series configs if they have more similar options in the future.

import { Box, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';

type StepConfigProps = {
    defaultColor: string;
    defaultLabel: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    onColorChange: (label: string, newColor: string) => void;
    onLabelChange: (label: string, newLabel: string) => void;
};

export const StepConfig: FC<StepConfigProps> = ({
    defaultColor,
    defaultLabel,
    swatches,
    color,
    label,
    onColorChange,
    onLabelChange,
    ...rest
}) => {
    return (
        <Stack spacing="xs" {...rest}>
            <Group spacing="xs">
                <ColorSelector
                    color={color}
                    defaultColor={defaultColor}
                    swatches={swatches}
                    onColorChange={(newColor: string) =>
                        onColorChange(defaultLabel, newColor)
                    }
                />
                <Box style={{ flexGrow: 1 }}>
                    <EditableText
                        placeholder={defaultLabel}
                        value={label}
                        onChange={(event) => {
                            onLabelChange(
                                defaultLabel,
                                event.currentTarget.value,
                            );
                        }}
                    />
                </Box>
            </Group>
        </Stack>
    );
};
