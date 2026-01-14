import { getItemLabelWithoutTableName } from '@lightdash/common';
import { ActionIcon, Box, Group, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import MantineIcon from '../../common/MantineIcon';

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
    const [debouncedValue, setValue] = useDebouncedState(initialValue, 300);

    useEffect(() => {
        // Only update if the debounced value differs from the current override
        // This prevents unnecessary updates on initial render
        const newLabel =
            debouncedValue === defaultLabel ? undefined : debouncedValue;
        if (newLabel !== labelOverride) {
            updateFieldConfig(fieldId, { label: newLabel || undefined });
        }
    }, [
        debouncedValue,
        defaultLabel,
        fieldId,
        labelOverride,
        updateFieldConfig,
    ]);

    return (
        <TextInput
            disabled={!isVisible}
            placeholder={defaultLabel}
            defaultValue={initialValue}
            onChange={(e) => setValue(e.currentTarget.value)}
        />
    );
};

type MapFieldConfigurationProps = {
    fieldId: string;
};

const MapFieldConfiguration: FC<MapFieldConfigurationProps> = ({ fieldId }) => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const [isTooltipVisible, setTooltipVisible] = useState(false);

    if (!isMapVisualizationConfig(visualizationConfig) || !itemsMap) {
        return null;
    }

    const { updateFieldConfig, isFieldVisible, getFieldLabel } =
        visualizationConfig.chartConfig;

    const item = itemsMap[fieldId];
    if (!item) return null;

    const defaultLabel = getItemLabelWithoutTableName(item);
    const labelOverride = getFieldLabel(fieldId);
    const isVisible = isFieldVisible(fieldId);

    return (
        <Group spacing="xs" noWrap style={{ flexGrow: 1 }}>
            <Box style={{ flexGrow: 1 }}>
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
                withinPortal
                label={isVisible ? 'Hide in tooltip' : 'Show in tooltip'}
            >
                <Box
                    onMouseEnter={() => setTooltipVisible(true)}
                    onMouseLeave={() => setTooltipVisible(false)}
                >
                    <ActionIcon
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
