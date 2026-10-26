import { getItemLabelWithoutTableName } from '@lightdash/common';
import { TextInput, Box, Group, ActionIcon, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    selectMapEditor,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useMapEditorActions } from '../../../hooks/useMapChartConfig';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationInputs } from '../../LightdashVisualization/useVisualizationContext';

type MapFieldConfigurationInputProps = {
    fieldId: string;
    defaultLabel: string;
    labelOverride: string | undefined;
    isVisible: boolean;
    updateFieldConfig: (
        fieldId: string,
        config: { visible?: boolean; label?: string },
    ) => void;
};

const MapFieldConfigurationInput: FC<MapFieldConfigurationInputProps> = ({
    fieldId,
    defaultLabel,
    labelOverride,
    isVisible,
    updateFieldConfig,
}) => {
    const initialValue = labelOverride ?? defaultLabel;
    const commitLabel = useDebouncedCallback((value: string) => {
        const newLabel = value === defaultLabel ? undefined : value;
        if (newLabel !== labelOverride) {
            updateFieldConfig(fieldId, { label: newLabel || undefined });
        }
    }, { delay: 300, flushOnUnmount: true });

    return (
        <TextInput
            size="xs"
            disabled={!isVisible}
            placeholder={defaultLabel}
            defaultValue={initialValue}
            onChange={(e) => commitLabel(e.currentTarget.value)}
        />
    );
};

type MapFieldConfigurationProps = {
    fieldId: string;
};

const MapFieldConfiguration: FC<MapFieldConfigurationProps> = ({ fieldId }) => {
    const { itemsMap } = useVisualizationInputs();
    const fieldConfig = useVisualizationSelector(
        (state) => selectMapEditor(state).fieldConfig[fieldId],
    );
    const { updateFieldConfig } = useMapEditorActions();
    const [isTooltipVisible, setTooltipVisible] = useState(false);

    if (!itemsMap) return null;

    const item = itemsMap[fieldId];
    if (!item) return null;

    const defaultLabel = getItemLabelWithoutTableName(item);
    const labelOverride = fieldConfig?.label;
    const isVisible = fieldConfig?.visible !== false;

    return (
        <Group gap="xs" wrap="nowrap" flex={1}>
            <Box flex={1}>
                <MapFieldConfigurationInput
                    fieldId={fieldId}
                    defaultLabel={defaultLabel}
                    labelOverride={labelOverride}
                    isVisible={isVisible}
                    updateFieldConfig={updateFieldConfig}
                />
            </Box>

            <Tooltip
                position="top"
                opened={isTooltipVisible}
                label={isVisible ? 'Hide in tooltip' : 'Show in tooltip'}
            >
                <Box
                    onMouseEnter={() => setTooltipVisible(true)}
                    onMouseLeave={() => setTooltipVisible(false)}
                >
                    <ActionIcon
                        color="gray"
                        variant="light"
                        onClick={() => {
                            setTooltipVisible(false);
                            updateFieldConfig(fieldId, {
                                visible: !isVisible,
                            });
                        }}
                    >
                        <MantineIcon icon={isVisible ? IconEye : IconEyeOff} />
                    </ActionIcon>
                </Box>
            </Tooltip>
        </Group>
    );
};

export default MapFieldConfiguration;
