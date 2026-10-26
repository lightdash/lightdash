// TODO: This could be combined with the pie chart or cartesian
// chart series configs if they have more similar options in the future.

import { Box, Group, Stack } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { useState, type FC } from 'react';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';

type StepConfigProps = {
    defaultColor: string;
    defaultLabel: string;
    id?: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    granularityFields?: string[];

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
    granularityFields,
    onColorChange,
    onLabelChange,
    ...rest
}) => {
    const stepId = id ?? defaultLabel;
    // Typing and colour picking are debounced before they reach the store
    const [draftLabel, setDraftLabel] = useState(label ?? '');
    const [draftColor, setDraftColor] = useState<string | undefined>();
    const commitLabel = useDebouncedCallback(
        (value: string) => onLabelChange(stepId, value),
        { delay: 500, flushOnUnmount: true },
    );
    const commitColor = useDebouncedCallback(
        (value: string) => {
            onColorChange(stepId, value);
            setDraftColor(undefined);
        },
        { delay: 500, flushOnUnmount: true },
    );
    return (
        <Stack gap="xs" {...rest}>
            <Group gap="xs">
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
            </Group>
        </Stack>
    );
};
