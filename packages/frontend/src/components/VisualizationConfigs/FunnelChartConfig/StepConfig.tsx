// TODO: This could be combined with the pie chart or cartesian
// chart series configs if they have more similar options in the future.

import { Box, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';
import { useDebouncedDraft } from '../common/useDebouncedDraft';

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
    const [draftLabel, setDraftLabel, flushLabel] = useDebouncedDraft(
        label ?? '',
        (value) => onLabelChange(stepId, value),
        { delay: 500 },
    );
    return (
        <Stack gap="xs" {...rest}>
            <Group gap="xs">
                <ColorSelector
                    color={color}
                    defaultColor={defaultColor}
                    swatches={swatches}
                    onColorChange={(newColor) =>
                        onColorChange(stepId, newColor)
                    }
                />
                <Box flex={1}>
                    <EditableText
                        placeholder={defaultLabel}
                        value={draftLabel}
                        granularityFields={granularityFields}
                        onChange={(event) =>
                            setDraftLabel(event.currentTarget.value)
                        }
                        onBlur={flushLabel}
                    />
                </Box>
            </Group>
        </Stack>
    );
};
